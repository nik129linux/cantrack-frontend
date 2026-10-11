# CanTrack Frontend

Web application for the CanTrack dog-walking platform.

This repository was split out of the CanTrack monorepo, keeping only
`apps/web`, `tests/web`, `package.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, `tsconfig.base.json`, and `vitest.config.ts`.

## Local development

Install dependencies from this repository root with `pnpm install`, copy
`apps/web/.env.example` to `apps/web/.env.local`, and set the Supabase URL and
publishable key. Set `VITE_API_URL` to the running CanTrack API, then start the
web app with `pnpm --dir apps/web dev`.

## Character artwork

The dog and walker portraits in `apps/web/public/art/characters` are cutouts
from the supplied sprite sheets. The walker sprite sheet carries the
© 2024 GameDev Assets credit.

## Related repositories

- [cantrack-backend](https://github.com/nik129linux/cantrack-backend) — FastAPI backend and API tests
- [cantrack-db](https://github.com/nik129linux/cantrack-db) — database schema
- [cantrack-ai](https://github.com/nik129linux/cantrack-ai) — AI services and their tests
- [cantrack](https://github.com/nik129linux/cantrack) — monorepo with the full project
 