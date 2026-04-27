function buildCookieAttributes(requestUrl, maxAgeSeconds) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `HttpOnly; Path=/api; SameSite=Lax; Max-Age=${maxAgeSeconds};${secure}`;
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return new Response('Missing GITHUB_CLIENT_ID', { status: 500 });
  }

  const url = new URL(context.request.url);
  const provider = url.searchParams.get('provider');

  if (provider && provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }

  const redirectUri = `${url.origin}/api/callback?provider=github`;
  const state = crypto.randomUUID();

  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', clientId);
  github.searchParams.set('redirect_uri', redirectUri);
  github.searchParams.set('scope', 'repo,user');
  github.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      'Set-Cookie': `cms_oauth_state=${state}; ${buildCookieAttributes(context.request.url, 600)}`
    }
  });
}
