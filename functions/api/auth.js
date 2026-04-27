function cookieSettings(requestUrl) {
  const url = new URL(requestUrl);
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `HttpOnly; Path=/api; SameSite=Lax; Max-Age=600;${secure}`;
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return new Response('Missing GITHUB_CLIENT_ID', { status: 500 });
  }

  const url = new URL(context.request.url);
  const redirectUri = `${url.origin}/api/callback`;
  const state = crypto.randomUUID();

  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', clientId);
  github.searchParams.set('redirect_uri', redirectUri);
  github.searchParams.set('scope', 'repo');
  github.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      'Set-Cookie': `state=${state}; ${cookieSettings(context.request.url)}`
    }
  });
}
