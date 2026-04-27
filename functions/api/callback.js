function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function buildCookieAttributes(requestUrl, maxAgeSeconds) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `HttpOnly; Path=/api; SameSite=Lax; Max-Age=${maxAgeSeconds};${secure}`;
}

function escapeForInlineScript(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function buildCallbackResponse(status, payload, requestUrl, statusCode = 200) {
  const serializedPayload = escapeForInlineScript(JSON.stringify(payload));

  return new Response(
    `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        function sendResult() {
          if (!window.opener) {
            return;
          }

          window.opener.postMessage(
            'authorization:github:${status}:${serializedPayload}',
            '*'
          );
          window.close();
        }

        function receiveMessage() {
          sendResult();
          window.removeEventListener('message', receiveMessage, false);
        }

        window.addEventListener('message', receiveMessage, false);

        if (window.opener) {
          window.opener.postMessage('authorizing:github', '*');
        } else {
          sendResult();
        }
      })();
    </script>
    <p>Authorizing Decap CMS…</p>
  </body>
</html>`,
    {
      status: statusCode,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': `cms_oauth_state=; ${buildCookieAttributes(requestUrl, 0)}`
      }
    }
  );
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;
  const clientSecret = context.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Response('Missing GitHub OAuth environment variables.', { status: 500 });
  }

  const url = new URL(context.request.url);
  const provider = url.searchParams.get('provider');

  if (provider && provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const oauthErrorDescription = url.searchParams.get('error_description');

  if (oauthError) {
    return buildCallbackResponse(
      'error',
      oauthErrorDescription || oauthError,
      context.request.url,
      400
    );
  }

  if (!code || !state) {
    return new Response('Missing OAuth code or state.', { status: 400 });
  }

  const cookies = parseCookies(context.request.headers.get('cookie'));
  const stateCookie = cookies.cms_oauth_state;

  if (!stateCookie || stateCookie !== state) {
    return new Response('Invalid OAuth state. Please retry login.', {
      status: 400,
      headers: {
        'Set-Cookie': `cms_oauth_state=; ${buildCookieAttributes(context.request.url, 0)}`
      }
    });
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
      redirect_uri: `${url.origin}/api/callback?provider=github`
    }).toString()
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    const errorMessage = tokenData.error_description || tokenData.error || 'Token exchange failed';
    return buildCallbackResponse('error', errorMessage, context.request.url, 500);
  }

  return buildCallbackResponse(
    'success',
    { token: tokenData.access_token },
    context.request.url
  );
}
