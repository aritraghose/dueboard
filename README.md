# dueboard

Dueboard keeps everything that's due on one board: tasks, habits, goals, notes and focus sessions, shared with connections through Live, diaries and profiles. **Tibo**, an AI friend that lives in the app, reads and changes the board for you, remembers your conversation for years, checks in at set times, passes messages between people, and answers questions on your public Ask page.

It runs on Cloudflare, built with [Alchemy](https://alchemy.run) and [Effect](https://effect.website):

- **TanStack Start** (React, Tailwind, shadcn/ui): the website, the only public Worker.
- **Effect RPC** + **Better Auth** (Google sign-in, a username chosen at `/onboarding`): the private `ApiWorker`.
- **Drizzle + Neon Postgres** over Hyperdrive: every user's data. Migrations are generated on dev and deploy.
- **Agents SDK** Durable Objects: `TiboAgent` (one per user: thread, memory, check-ins) and `AskAgent` (one per Ask-page visitor), on Meta Muse Spark through AI Gateway (BYOK), with Vectorize for memory.
- **Atom RPC**: reactive queries and mutations in the browser.

What it does and why is in [notes/planning.md](notes/planning.md); how it's built, in [notes/architecture.md](notes/architecture.md).

## Architecture

```
Browser ── /rpc, /api/auth/*, pages ──▶ Website (web/) ── env.API ──▶ ApiWorker ── Hyperdrive ──▶ Neon Postgres
   │                                      │                          (RPC + Better Auth,              ▲
   └── /agents/* (WebSocket, HTTP) ──────▶│ env.AGENT                 session-sweep cron)             │
                                          ▼                                                           │
                                     AgentWorker ── env.DOMAIN ──▶ DomainWorker (Worker RPC only) ────┘
                                      ├─ TiboAgent DO per user ── AI Gateway (Muse Spark), Vectorize
                                      └─ AskAgent DO per visitor (walled off: two domain calls only)
```

The browser only ever talks to the website. It forwards `/rpc` and `/api/auth/*` to the `ApiWorker` and `/agents/*` to the `AgentWorker` over private service bindings, pinning Tibo to the signed-in user and computing the Ask agent's name itself. The `DomainWorker` is bound only into the `AgentWorker`, so Tibo reaches the same domain services the UI uses, as its own user, and a browser can't reach it at all. None of the private Workers has a public URL.

- `api/` (`DueboardApi` stack): `src/rpc.ts` the RPC contract shared with web, `src/handlers.ts` the handlers (served by `src/api.ts` and `src/DomainWorker.ts`), `src/domain/` the domain services that hold every business rule, `src/tibo/` Tibo, `src/ask/` the Ask agent, `src/limits.ts` every rate limit, `src/schema.ts` the Drizzle tables.
- `web/` (`DueboardWeb` stack): `src/server.ts` the Worker entry (rate limits, origin checks, the `/agents/*` proxy), routes in `src/routes/`, RPC client in `src/rpc-client.ts`, design tokens in `src/styles.css`. Read bindings via `src/env.ts`, not `cloudflare:workers` directly (breaks in dev).

Web routes are grouped by pathless layouts (the `_` folder doesn't add to the URL):

- `_public/`: anyone (`/`).
- `_auth/`: `/auth` for signed-out users, `/onboarding` for signed-in users without a username.
- `_app/`: the app (`/now`, `/inbox`, boards, `/settings`, …), only for signed-in users with a username. Sign-in lands on `/now`. The layout calls the `Bootstrap` RPC on every load to set up the user and sync their time zone.
- `@{$username}.tsx` and `@{$username}_.ask.tsx`: public profiles and Ask pages.
- `api/auth/$.ts` and `rpc.ts`: proxies to the API, so app routes can't use `/api`, `/rpc` or `/agents`.

Stack names and the rate limit `namespaceId`s (`src/limits.ts`) must be unique on the Cloudflare account.

## Development

```bash
bun install
bun run dev:api   # terminal 1, start first
bun run dev:web   # terminal 2, open the printed websiteUrl
```

- `dev:web` runs `tsc -b` first, since web imports `@dueboard/api` from `api/lib/`. Restart it after changing `api/src/rpc.ts`.
- Ports are fixed (`api/src/dev-ports.ts`): ApiWorker 1337, DomainWorker 1338, website 1339, AgentWorker 1340.
- Dev uses a real Neon branch (stage `dev_$USER`) and no Hyperdrive. Commit generated files in `api/migrations/`.
- Under `alchemy dev`, Turnstile uses Cloudflare's test keys and Tibo's `dev/*` routes are on (seeding a thread, running check-ins and memory jobs now).
- Remove dev resources with `alchemy destroy --stage dev_$USER` in `web`, then `api`.
- `bun run build` type-checks both workspaces. `cd api && bun test` runs the unit tests (pure rules, prompts, the Ask agent's walls, time zones).
- On a machine with little memory, stop the dev servers before `bun run build`.

## Google auth setup

1. In Google Cloud console → Google Auth platform, create a **Web application** client with scopes `openid`, `email`, `profile`.
2. Add redirect URIs `http://localhost:1339/api/auth/callback/google` (the website's dev port, fixed in `api/src/dev-ports.ts` with `strictPort`; the ApiWorker, DomainWorker and AgentWorker take 1337, 1338 and 1340) and `<websiteUrl>/api/auth/callback/google` per deployed stage.
3. Copy `api/.env.example` to:
   - `api/.env` (dev): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - `api/.env.<stage>` (each deployed stage, such as `.env.staging`): the same, plus `AUTH_BASE_URL` set to that stage's website origin. All `.env*` files but the template are gitignored.

## Deploy

Credentials live in Alchemy profiles (`bunx alchemy profile edit --add Cloudflare` / `--add Neon`). Cloudflare needs an **API token with Hyperdrive: Edit**, since OAuth can't grant it.

Each stage has its own Neon project, Workers, AI Gateway, Vectorize index and Turnstile widget. `pr-*` stages branch off `staging`'s database, so deploy `staging` first.

```bash
cd api && bun run deploy --stage staging --env-file .env.staging
cd web && bun run deploy --stage staging
```

Deploy `api` first; destroy in reverse order. A commented `Neon.Connect` alternative in `api/src/api.ts` avoids Hyperdrive at the cost of a new connection per request.

**A new stage, once:**

1. `api/.env.<stage>`: the Google client's id and secret, and `AUTH_BASE_URL`, the stage's website origin. With a custom domain (the plan: `dueboard.com`) it's known up front. On a workers.dev URL it isn't known before the first deploy, so the first `api` deploy uses a stand-in https origin; deploy `web`, set `AUTH_BASE_URL` to the `websiteUrl` it printed, and deploy `api` again (this also points the Turnstile widget at the real hostname).
2. Google Cloud console: add `<websiteUrl>/api/auth/callback/google` to the OAuth client's redirect URIs.
3. Cloudflare dashboard → AI → AI Gateway → the stage's gateway (the `aiGatewayId` output) → Provider Keys: add the Meta key with the `default` alias. The gateway requires authentication, and every call sends `cf-aig-no-wholesale`, so nothing falls back to Unified Billing.
4. Optional: `AI_MONTHLY_MESSAGE_QUOTA` in the env file (default 150).

## Dependencies

All versions live in the root `package.json` `catalog`; add packages with `bun add <pkg> --catalog`. Bump these groups together:

- `alchemy` + `@alchemy.run/*` (exact beta peers).
- `effect` + `@effect/*` (same patch).
- `drizzle-orm` + `drizzle-kit` pinned to `1.0.0-rc.5-ab785fc` (`latest` is the old 0.x).
- `better-auth` pinned to `1.7.5`; pass it explicitly when adding to a workspace.
- `@tanstack/react-start` must match its exact `@tanstack/react-router` version.

`@alchemy.run/cloudflare@2.0.0-beta.84` is patched (`patches/`) with the dev-server fix from [alchemy-run/alchemy#2525](https://github.com/alchemy-run/alchemy/pull/2525). Remove the patch once a release includes it.
