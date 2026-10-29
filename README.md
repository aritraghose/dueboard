# dueboard

A full-stack app on Cloudflare, built with [Alchemy](https://alchemy.run) and [Effect](https://effect.website):

- **TanStack Start** (React, Tailwind, shadcn/ui): the frontend Worker.
- **Effect RPC**: the API, a private `RpcWorker`.
- **Drizzle + Neon Postgres** over Cloudflare Hyperdrive. Migrations are generated on deploy.
- **Atom RPC**: reactive queries and mutations in the browser.
- **Better Auth**: Google sign-in at `/auth` plus a unique username chosen at `/onboarding`.

Based on Alchemy's [cloudflare-tanstack-rpc-drizzle](https://github.com/alchemy-run/alchemy/tree/main/examples/cloudflare-tanstack-rpc-drizzle) and [monorepo-multi-stack](https://github.com/alchemy-run/alchemy/tree/main/examples/monorepo-multi-stack) examples.

## Architecture

```
Browser ── POST /rpc, /api/auth/* ──▶ web (TanStack Start)
                                        │ env.API service binding
                                        ▼
                                      api (ApiWorker) ── Hyperdrive ──▶ Neon Postgres
```

The browser calls same-origin routes and the web Worker forwards them over a private service binding, so the API has no public URL and needs no CORS.

- `api/` (`DueboardApi` stack): `src/rpc.ts` is the RPC contract shared with web, `src/api.ts` the handlers, `src/auth.ts` Better Auth, `src/database.ts` Neon + Hyperdrive, `src/schema.ts` the Drizzle tables.
- `web/` (`DueboardWeb` stack): routes in `src/routes/`, RPC client in `src/rpc-client.ts`. Read bindings via `src/env.ts`, not `cloudflare:workers` directly (breaks in dev).

Web routes are grouped by pathless layouts (the `_` folder doesn't add to the URL):

- `_public/`: anyone (`/`, later `/pricing`, `/about`).
- `_auth/`: `/auth` for signed-out users, `/onboarding` for signed-in users without a username.
- `_app/`: the app (`/glance`, …), only for signed-in users with a username. Sign-in lands on `/glance`.
- `api/auth/$.ts` and `rpc.ts`: proxies to the API, so app routes can't use `/api` or `/rpc`.

Stack names and the rate limit `namespaceId`s (`1003`, `1004`) must be unique on the Cloudflare account.

## Development

```bash
bun install
bun run dev:api   # terminal 1, start first
bun run dev:web   # terminal 2, open the printed websiteUrl
```

- `dev:web` runs `tsc -b` first, since web imports `@dueboard/api` from `api/lib/`. Restart it after changing `api/src/rpc.ts`.
- Dev uses a real Neon branch (stage `dev_$USER`) and no Hyperdrive. Commit generated files in `api/migrations/`.
- Remove dev resources with `alchemy destroy --stage dev_$USER` in `web`, then `api`.
- `bun run build` type-checks both workspaces.

## Google auth setup

1. In Google Cloud console → Google Auth platform, create a **Web application** client with scopes `openid`, `email`, `profile`.
2. Add redirect URIs `http://localhost:1338/api/auth/callback/google` and `<websiteUrl>/api/auth/callback/google` per deployed stage.
3. Copy `api/.env.example` to:
   - `api/.env` (dev): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - `api/.env.live` (deploy): the same, plus `AUTH_BASE_URL` set to the website origin.

For a new stage, deploy `api` with a placeholder `AUTH_BASE_URL`, deploy `web`, then set the real URL and redeploy `api`.

## Deploy

Credentials live in Alchemy profiles (`bunx alchemy profile edit --add Cloudflare` / `--add Neon`). Cloudflare needs an **API token with Hyperdrive: Edit**, since OAuth can't grant it.

```bash
cd api && bun run deploy --env-file .env.live
cd web && bun run deploy
```

Deploy `api` first; destroy in reverse order. A commented `Neon.Connect` alternative in `api/src/api.ts` avoids Hyperdrive at the cost of a new connection per request.

## Dependencies

All versions live in the root `package.json` `catalog`; add packages with `bun add <pkg> --catalog`. Bump these groups together:

- `alchemy` + `@alchemy.run/*` (exact beta peers).
- `effect` + `@effect/*` (same patch).
- `drizzle-orm` + `drizzle-kit` pinned to `1.0.0-rc.5-ab785fc` (`latest` is the old 0.x).
- `better-auth` pinned to `1.7.5`; pass it explicitly when adding to a workspace.
- `@tanstack/react-start` must match its exact `@tanstack/react-router` version.

`@alchemy.run/cloudflare@2.0.0-beta.84` is patched (`patches/`) with the dev-server fix from [alchemy-run/alchemy#2525](https://github.com/alchemy-run/alchemy/pull/2525). Remove the patch once a release includes it.
