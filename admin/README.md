# GEOPOLIS CMS authentication setup (GitHub only)

This CMS is configured to use the GitHub backend with a Cloudflare Pages OAuth proxy at:

- `/api/auth`
- `/api/callback`

## Required Cloudflare Pages environment variables

Set these in your Cloudflare Pages project settings:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## GitHub OAuth App settings

In GitHub (Settings → Developer settings → OAuth Apps), create/update your OAuth app:

- **Homepage URL:** `https://geopolis-site.pages.dev/admin/`
- **Authorization callback URL:** `https://geopolis-site.pages.dev/api/callback`

After these values are set, the **Login with GitHub** button in `/admin/` authenticates against GitHub (not Netlify) and CMS publishes directly to `main` in `anandkumarjha11110/geopolis-site`.
