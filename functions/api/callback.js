function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  const value = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix));

  return value ? value.slice(prefix.length) : null;
}

function clearStateCookie(requestUrl) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `state=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0;${secure}`;
}

function sendCallbackMessage(payload, origin, status = 200, clearCookie = '') {
  const script = `<!doctype html>
<html>
  <body>
    <script>
      window.opener && window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(origin)});
      window.close();
    </script>
  </body>
</html>`;

  const headers = { 'Content-Type': 'text/html; charset=utf-8' };
  if (clearCookie) headers['Set-Cookie'] = clearCookie;
  return new Response(script, { status, headers });
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;
  const clientSecret = context.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Response('Missing GitHub OAuth environment variables', { status: 500 });
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const clearCookie = clearStateCookie(context.request.url);

  if (error) {
    return sendCallbackMessage(
      `authorization:github:error:${JSON.stringify({ provider: 'github', error })}`,
      url.origin,
      400,
      clearCookie
    );
  }

  if (!code || !state) {
    return sendCallbackMessage(
      `authorization:github:error:${JSON.stringify({ provider: 'github', error: 'Missing code or state' })}`,
      url.origin,
      400,
      clearCookie
    );
  }

  const storedState = readCookie(context.request.headers.get('Cookie'), 'state');
  if (!storedState || storedState !== state) {
    return sendCallbackMessage(
      `authorization:github:error:${JSON.stringify({ provider: 'github', error: 'Invalid OAuth state' })}`,
      url.origin,
      401,
      clearCookie
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: `${url.origin}/api/callback`
  });

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await tokenRes.json();

  if (!tokenRes.ok || !data.access_token) {
    return sendCallbackMessage(
      `authorization:github:error:${JSON.stringify({
        provider: 'github',
        error: data.error_description || data.error || 'Token exchange failed'
      })}`,
      url.origin,
      502,
      clearCookie
    );
  }

  return sendCallbackMessage(
    `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`,
    url.origin,
    200,
    clearCookie
  );
}
