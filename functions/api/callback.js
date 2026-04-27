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

function htmlResponse(messageScript, status = 200) {
  return new Response(
    `<!doctype html><html><body>${messageScript}</body></html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;
  const clientSecret = context.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return htmlResponse('<p>Missing GitHub OAuth environment variables.</p>', 500);
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const oauthErrorDescription = url.searchParams.get('error_description');

  if (oauthError) {
    return htmlResponse(
      `<script>window.opener && window.opener.postMessage('authorization:github:error:${oauthErrorDescription || oauthError}','*');window.close();</script>`,
      400
    );
  }

  if (!code || !state) {
    return htmlResponse('<p>Missing OAuth code or state.</p>', 400);
  }

  const cookies = parseCookies(context.request.headers.get('cookie'));
  const stateCookie = cookies.cms_oauth_state;

  if (!stateCookie || stateCookie !== state) {
    return new Response('<p>Invalid OAuth state. Please retry login.</p>', {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
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
      redirect_uri: `${url.origin}/api/callback`
    }).toString()
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    const errorMessage = tokenData.error_description || tokenData.error || 'Token exchange failed';
    return new Response(
      `<!doctype html><html><body><script>window.opener && window.opener.postMessage('authorization:github:error:${errorMessage}','*');window.close();</script><p>${errorMessage}</p></body></html>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': `cms_oauth_state=; ${buildCookieAttributes(context.request.url, 0)}`
        }
      }
    );
  }

  return new Response(
    `<!doctype html><html><body><script>window.opener && window.opener.postMessage('authorization:github:success:${tokenData.access_token}','*');window.close();</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': `cms_oauth_state=; ${buildCookieAttributes(context.request.url, 0)}`
      }
    }
  );
}
