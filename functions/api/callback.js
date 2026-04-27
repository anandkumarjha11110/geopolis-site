async function exchangeCodeForToken({ code, clientId, clientSecret, redirectUri }) {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenRes.ok) {
    throw new Error(`GitHub token exchange failed with status ${tokenRes.status}`);
  }

  const payload = await tokenRes.json();
  if (!payload.access_token) {
    throw new Error(payload.error_description || 'GitHub token exchange did not return access_token.');
  }

  return payload.access_token;
}

function readStateCookie(cookieHeader = '') {
  const match = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('decap_oauth_state='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

export async function onRequest(context) {
  const clientId = context.env.GITHUB_CLIENT_ID;
  const clientSecret = context.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Response('Missing GitHub OAuth environment variables.', { status: 500 });
  }

  const callbackUrl = new URL(context.request.url);
  const code = callbackUrl.searchParams.get('code');
  const state = callbackUrl.searchParams.get('state');
  const storedState = readStateCookie(context.request.headers.get('Cookie') || '');

  if (!code) {
    return new Response('Missing code from GitHub OAuth callback.', { status: 400 });
  }

  if (!state || !storedState || state !== storedState) {
    return new Response('Invalid OAuth state. Please try logging in again.', { status: 400 });
  }

  try {
    const redirectUri = `${callbackUrl.origin}/api/callback`;
    const token = await exchangeCodeForToken({ code, clientId, clientSecret, redirectUri });

    const script = `
      <script>
        window.opener.postMessage(
          'authorization:github:success:${JSON.stringify({ token, provider: 'github' })}',
          window.location.origin
        );
        window.close();
      </script>
    `;

    return new Response(script, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': 'decap_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OAuth error';
    return new Response(`GitHub OAuth failed: ${message}`, { status: 500 });
  }
}
