const GITHUB_OAUTH_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_OAUTH_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function getBaseUrl(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function getRedirectUri(request) {
  return `${getBaseUrl(request)}/api/auth/callback`;
}

function randomState() {
  return crypto.randomUUID();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth/, '') || '/';

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return json(
      { error: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET environment variables.' },
      500,
    );
  }

  if (path === '/' || path === '/login') {
    const state = randomState();
    const authorizeUrl = new URL(GITHUB_OAUTH_AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', getRedirectUri(request));
    authorizeUrl.searchParams.set('scope', 'repo');
    authorizeUrl.searchParams.set('state', state);

    return Response.redirect(authorizeUrl.toString(), 302);
  }

  if (path === '/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      return json({ error: 'Missing GitHub OAuth code.' }, 400);
    }

    const tokenRes = await fetch(GITHUB_OAUTH_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: getRedirectUri(request),
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      return json({ error: 'Failed to exchange GitHub OAuth token.', details: tokenData }, 400);
    }

    return new Response(
      `<!doctype html><html><body><script>
        (function(){
          const token = ${JSON.stringify(tokenData.access_token)};
          window.opener && window.opener.postMessage('authorization:github:success:' + token, window.location.origin);
          window.close();
        })();
      </script></body></html>`,
      {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    );
  }

  return json({ error: 'Not found' }, 404);
}
