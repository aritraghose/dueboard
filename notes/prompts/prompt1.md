# Prompt 1: Domain foundation

You are building step 1 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (spec, working rules, build order) and
`notes/architecture.md`. This is the first step, so nothing in the plan is
built yet. What exists: Google sign-in and username onboarding (Better Auth), an
empty Effect RPC API, a temporary `/glance` page, and a demo chat agent
(`api/src/agent.ts`, `ChatAgent`). Leave the demo chat agent alone; step 17
replaces it.

## Rules

- **Ask me before installing any dependency** (exact package and version). Use `bun add <pkg> --catalog` from `api/` or `web/`, and pick a version older than 2 days.
- **Confirm with me before any deploy.**
- Low-RAM machine: never run `tsc -b` or a build while `alchemy dev` is running.
- Ask before committing.

## Goal

Lay the groundwork every later step builds on:
- the domain service pattern;
- user settings, tags and the activity table;
- time zone handling;
- the move from `/glance` to `/now`.

## Read first

- `api/src/api.ts`: how the RpcWorker builds `db` and the `Authentication` middleware.
- `api/src/rpc.ts`: the RPC contract and `CurrentUser`.
- `api/src/schema.ts`: empty Drizzle schema and its notes on Better Auth's tables.
- `api/src/database.ts`: Neon, Hyperdrive and migrations.
- `api/src/auth.ts`: Better Auth with the username plugin.
- `web/src/rpc-client.ts` and `web/src/routes/rpc.ts`: the AtomRpc client.
- `web/src/routes/_app/route.tsx`, `web/src/routes/_app/glance.tsx`, `web/src/routes/_auth/onboarding.tsx`, `web/src/session.ts`.

## Build

### 1. ID strategy

Pick one id strategy and document it in `notes/architecture.md` §4. Recommended: `crypto.randomUUID()` stored as `text`, which needs no dependency. If you think UUIDv7 is worth it (for time ordering), ask me first.

### 2. Database access as an Effect service

- Make database access an Effect service (for example `Database` in `api/src/domain/database.ts`) that provides the Drizzle `db`. Domain services then depend on it, and `api/src/api.ts` provides it.
- Domain services take the acting user id **explicitly**. They must be callable from RPC handlers now and from an internal Worker RPC entrypoint for Tibo later (step 18).

### 3. Schema in `api/src/schema.ts`

- **Enums**: `privacy` (`public`, `connections`, `private`) and `relay_policy` (`connections`, `anyone`, `none`).
- **`user_settings`**:
  - `user_id` PK (text);
  - `time_zone` (IANA, not null);
  - `default_privacy` (default `connections`);
  - `default_share_to_live` (default true);
  - `relay_policy` (default `connections`);
  - `ai_quota_override` (int, nullable);
  - `created_at` and `updated_at`.
- **`tags`**:
  - `id`, `user_id`, `name`, `color`;
  - `system_kind` (nullable enum `default`/`habit`/`goal`);
  - `created_at`;
  - a unique index on `(user_id, lower(name))`.
  - Choose a color format (a palette key or hex) that fits the design system in step 2. A small fixed palette of named colors is recommended, so tags stay readable in light and dark mode.
- **`activity`**:
  - `id`, `user_id`, `kind` (enum with every kind in architecture §5), `subject_type`, `subject_id`, `occurred_at`, `local_date`, `meta jsonb`;
  - indexes on `(user_id, occurred_at desc)`, `(user_id, local_date)` and `(subject_type, subject_id)`.
- Add every table to `defineRelations`.

### 4. Domain modules in `api/src/domain/`

- **`dates.ts`** (pure, with `bun test` tests). Use `Intl` only, no date library unless you ask me.
  - `todayIn(tz)`;
  - `localDateOf(instant, tz)`;
  - `startOfWeek(date)` (weeks start Sunday);
  - `addDays`;
  - `isValidTimeZone`;
  - a `LocalDate` string type (`YYYY-MM-DD`) with a Schema.
- **`settings.ts`**:
  - `ensureUserSetup(userId, timeZone)`: idempotent. Creates the settings row and the three system tags (`default`, `habit`, `goal`) if missing.
  - `getSettings`;
  - `updateSettings`;
  - `syncTimeZone` (updates only if the zone changed and is valid).
- **`tags.ts`**:
  - list, create, update (rename and recolor; system tags can be recolored only), delete (system tags can't be deleted).
  - Write deletion so step 3 can reassign that tag's tasks to the user's `default` tag. Leave a clear seam or TODO.
  - Validate name length (1–30), color (from the palette), and a per-user maximum (e.g. 50 tags).
- **`activity.ts`**:
  - `recordActivity(tx, {...})`, which computes `local_date` from the actor's time zone;
  - `deleteActivityFor(tx, subjectType, subjectId, kind?)`.
  - These are internal helpers, with no RPC yet.

### 5. RPCs in `rpc.ts` and `api.ts`

- **`Bootstrap({ timeZone })`**: calls `ensureUserSetup`, then `syncTimeZone`. Returns settings and tags. The `_app` layout calls it on every app load, sending the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`. This also backfills existing accounts.
- **`UpdateSettings`**.
- **`ListTags`**, **`CreateTag`**, **`UpdateTag`**, **`DeleteTag`**.
- Use typed errors (Schema tagged errors) for validation failures.

### 6. `/glance` → `/now`

- Move the route to `web/src/routes/_app/now.tsx`.
- Sign-in and onboarding land on `/now`. Update every redirect that points at `/glance`.
- `/glance` redirects to `/now`.
- Keep the existing demo chat and the temporary profile card on `/now` for now. Step 2 replaces the page layout.

### 7. Run and document

- Run `alchemy dev` (api, then web) so the migration is generated into `api/migrations/`. Commit it with the rest of the change.
- Update the README's Architecture/Development notes where they mention `/glance`.

## Acceptance

- [ ] `bun test` passes for `dates.ts`.
- [ ] Typecheck passes (with dev servers stopped).
- [ ] After signing in, an existing account gets a settings row and three system tags, and the time zone is saved.
- [ ] `/glance` redirects to `/now`.
- [ ] The migration is generated.

## Out of scope

- Any UI beyond the route move.
- Tasks, habits and the other features (later steps).

## When done

- Tick step 1 in `notes/planning.md` → Status.
- Record any decisions in its Decision log.
- Summarize what you built and anything step 2 should know.
