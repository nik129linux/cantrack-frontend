# CanTrack Frontend

React 19 / TypeScript / Vite PWA for dog owners and walkers in Pasto.
Includes reference-photo galleries, dog care details, pickup/return photo AI results,
GPS recovery, street-route retries, form drafts and connection recovery.

## Local setup

Use Node.js 20 or newer and pnpm 9. Install from the repository root:

```sh
npx pnpm@9 install --frozen-lockfile
cp apps/web/.env.example apps/web/.env
npm run dev
```

Set `VITE_API_URL` to the backend URL, `VITE_SUPABASE_URL` to the project URL,
and `VITE_SUPABASE_PUBLISHABLE_KEY` to its public browser key. Never use a service-role key.
The development web server runs on http://localhost:5173; the API runs on port 3000.

```sh
npm test -- --reporter=dot
npm run typecheck
npm run build
```

On Node.js 26, set `NODE_OPTIONS=--no-experimental-webstorage` before running tests
(PowerShell: `$env:NODE_OPTIONS='--no-experimental-webstorage'`).
Build output is `apps/web/dist`. Vite embeds its environment variables at build time.
The build and tests do not require AI provider credentials.

## Deployment

See [the deployment guide](docs/DEPLOYMENT.md). The existing AWS web address is
https://d2p0dna7twnh6n.cloudfront.net; Android's domain association is in
`apps/web/public/.well-known/assetlinks.json`. Signing keys and passwords are kept outside Git.

## Project repositories

| Component | Repository |
|---|---|
| Complete source | https://github.com/nik129linux/cantrack |
| Frontend | https://github.com/nik129linux/cantrack-frontend |
| Backend | https://github.com/nik129linux/cantrack-backend |
| Database | https://github.com/nik129linux/cantrack-db |
| AI package | https://github.com/nik129linux/cantrack-ai |
