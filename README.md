# Dueboard

**Your day has a sidekick now.**

Dueboard is a day planner with a friend inside. You keep your tasks, habits, goals, notes and focus sessions in one place, and you plan them with **Tibo**, an AI friend who can change your plan when you ask, remembers what you tell it, and checks in on you. Your connections can see what you get done, and you can see what they get done.

Dueboard is open source and runs entirely on Cloudflare.

## Contents

- [Your day](#your-day)
- [What you can keep](#what-you-can-keep)
- [Tibo](#tibo)
- [Friends, sharing and privacy](#friends-sharing-and-privacy)
- [Your Ask page](#your-ask-page)
- [AI usage](#ai-usage)
- [Your account](#your-account)
- [How it's built](#how-its-built)

## Your day

- **Now** is home. It shows one day at a time: that day's tasks, tasks with no date, the habits due, your active goals, your focus session and what your connections did recently. The arrows step through days, and **Upcoming** lists what's coming in the next weeks.
- **Boards** opens each part of the app as its own page: Tasks, Habits, Goals, Notes, Live and Diary.
- Everything follows your own time zone. Travel, and "today" moves with you. Weeks start on Sunday.

## What you can keep

**Tasks.** A title, an optional description, a day to do it, a deadline, a tag, how important it is (1 to 5) and how long you expect it to take. A task is open, in progress or settled. It shows on its assigned day and its deadline day. Tasks with no dates wait in their own list. Missed tasks aren't carried over, so a new day starts clean.

**Habits.** Two kinds:
- *Flexible*: a number of times per period, such as 3 times a week, twice every 5 days or 10 times a month. It shows every day until you hit the target for that period.
- *Specific days*: chosen weekdays or days of the month, with as many check-ins as you set for each day.

Each tap counts as a check-in, and you can undo one. Habits keep a streak. You can pause a habit, resume it or archive it, and paused days never count against you.

**Goals.** Track progress with a slider (a percentage) or a count toward a target, with an optional target date. Link habits and tasks to a goal, and each check-in or settled task moves it forward on its own. Goals can be paused, completed and reopened.

**Notes.** Short notes about your day, up to 60 characters each and up to 50 a day. You can only write notes for today.

**Focus sessions.** A timer for focused work, from 1 minute to 10 hours, with an optional label. Pause it, resume it or add time. You can run one session at a time. The countdown also shows in the browser tab, and a session completes on its own when time runs out.

**Tags.** Color-coded tags for your tasks. Habits and goals have their own built-in tags.

## Tibo

Tibo is a friend who lives in the app: quirky, a little overconfident and funny, but it gets things done. If you seem to be having a really hard time, it drops the act and is direct and kind. It never swears. Tibo answers in short, chat-like messages. You can talk to it from the Tibo button on any page, or full screen in the **Inbox**. Both are the same conversation, kept in sync on all your devices.

**It works on your plan with you.** Ask in plain words and Tibo creates, updates and settles tasks; checks off, pauses and resumes habits; creates goals, moves their progress and links items to them; writes notes; runs focus sessions; and reads your Live and diary. Each change shows up in the chat as a card you can tap. Tibo asks before doing anything destructive or surprising, such as deleting something, stopping a running session or changing many things at once.

**It remembers.** There's one conversation, kept forever. Tibo picks up lasting facts about you as you talk, keeps summaries by day, week, month and year, and can search everything you've ever said ("what did I say about the trip in March?"). You can read and delete its memories in Settings or in Tibo's side panel.

**It checks in.** If you want, Tibo messages you first: a morning plan, a nudge when a deadline is close, and an evening habit check. You choose the morning and evening times, and you can turn off each kind. Ask it to remind you of something, and it sends the reminder at the time you set.

**It passes notes.** Say "ask @bea if she's up for dinner Sunday" and Tibo sends your words to Bea's Tibo. Bea's Tibo asks her, and her answer comes back to you in your chat. Only your own words cross over, never anything else about you. In settings you choose who can send you notes: your connections, anyone, or no one.

**It reads your files and makes pictures.** Send it photos, PDFs, documents, text or code (up to 10 MB each, 4 per message) by tapping +, pasting, or dropping files into the chat. Tibo keeps the ones that say something lasting about you, such as a timetable or an offer letter, and skips memes and screenshots. It can also make a picture, or edit one you sent, up to 5 a day.

**You can see what it's doing.** In the Inbox, Tibo's side panel shows what it's doing right now, the photos and files from your chat, its memories, and a full log of everything it did.

## Friends, sharing and privacy

- **Every item has a privacy setting**: *public* (anyone), *connections* (people you're connected with) or *private* (only you). A separate switch decides whether the item appears on Live. You set the defaults for new items in Settings.
- **Live** is the feed of what you and your connections get done: tasks settled, habits checked, goals moved, sessions finished. For a private item, your connections see only that something happened ("settled a task"), not its title. People you aren't connected with never see your Live.
- **Diary** is your record of each day, newest first. Others see the parts of your diary they're allowed to see.
- **Profiles** live at `/@username`. A profile has your counts, a year-long activity graph, and tabs for your tasks, habits, goals, diary and sessions, each filtered by what the viewer may see. Anyone can open a profile, even without signing in, but strangers see only public items and the graph. The graph shows only how much you did each day, never what.
- **Connections** are mutual. Find people in **Discover**, send a request, and accept or decline the ones you receive. The bell shows new requests and accepted ones.
- **Leaderboard**: earn a point for each task you settle, each habit you check in a day, each goal you move in a day and each focus session you complete. Compare with your connections or everyone, for today, this week, this month or all time.
- **Block** anyone. Blocking hides everything both ways and stops their requests, notes and Ask-page questions.

## Your Ask page

Turn on a public page at `/@username/ask` where anyone can ask questions about you, and Tibo answers for you. Tibo answers only from what you give it: your instructions, the context you share, and up to two PDFs, such as your CV. Before anything is saved, you can read and edit the text taken from each PDF. When Tibo doesn't know an answer, it says so and suggests reaching out to you directly, rather than guessing.

- This Tibo is a separate assistant. It can't see your chat with Tibo, your memories or your plan.
- People who are signed in use their own AI messages to ask. People who aren't use a monthly pool you set, from 1 to 50 answers.
- You can read the questions people asked in Settings for 30 days, and visitors are told that.
- Visitors pass a quick bot check before their first question. The page is off until you turn it on.

## AI usage

Each account gets **150 AI messages a month**. A message is one reply from Tibo, however many chat bubbles it uses, or one Tibo check-in, or one Ask-page answer. A picture Tibo makes costs one more message. Each turn caused by a passed note costs half a message to each person. Background work, such as remembering and summarizing, is free. When you reach the limit, the chat box closes until the next month.

## Your account

- Sign in with Google, then choose a username: 4 to 15 letters, numbers or underscores. **Usernames can't be changed**, so profile links never break.
- Choose a light, dark or system theme.
- Install Dueboard as an app from your browser. It opens straight to Now.
- Delete your account in Settings. Your data, your conversation with Tibo, its memories and your files are all removed.

## How it's built

It runs on Cloudflare, built with [Alchemy](https://alchemy.run) and [Effect](https://effect.website):

- **TanStack Start** (React, Tailwind, shadcn/ui): the website, the only public Worker.
- **Effect RPC** + **Better Auth** (Google sign-in, a username chosen at `/onboarding`): the private `ApiWorker`.
- **Drizzle + Neon Postgres** over Hyperdrive: every user's data. Migrations are generated on dev and deploy.
- **Agents SDK** Durable Objects: `TiboAgent` (one per user: thread, memory, check-ins) and `AskAgent` (one per Ask-page visitor), on Meta Muse Spark through AI Gateway (BYOK), with Vectorize for memory.
- **Atom RPC**: reactive queries and mutations in the browser.

How it's built in detail, including the data model, privacy rules, Tibo's internals and every rate limit, is in [notes/architecture.md](notes/architecture.md).

### Architecture

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

### Development

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

### Google auth setup

1. In Google Cloud console → Google Auth platform, create a **Web application** client with scopes `openid`, `email`, `profile`.
2. Add redirect URIs `http://localhost:1339/api/auth/callback/google` (the website's dev port, fixed in `api/src/dev-ports.ts` with `strictPort`; the ApiWorker, DomainWorker and AgentWorker take 1337, 1338 and 1340) and `<websiteUrl>/api/auth/callback/google` per deployed stage.
3. Copy `api/.env.example` to:
   - `api/.env` (dev): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - `api/.env.<stage>` (each deployed stage, such as `.env.staging`): the same, plus `AUTH_BASE_URL` set to that stage's website origin. All `.env*` files but the template are gitignored.

### Deploy

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

### Dependencies

All versions live in the root `package.json` `catalog`; add packages with `bun add <pkg> --catalog`. Bump these groups together:

- `alchemy` + `@alchemy.run/*` (exact beta peers).
- `effect` + `@effect/*` (same patch).
- `drizzle-orm` + `drizzle-kit` pinned to `1.0.0-rc.5-ab785fc` (`latest` is the old 0.x).
- `better-auth` pinned to `1.7.5`; pass it explicitly when adding to a workspace.
- `@tanstack/react-start` must match its exact `@tanstack/react-router` version.

`@alchemy.run/cloudflare@2.0.0-beta.84` is patched (`patches/`) with the dev-server fix from [alchemy-run/alchemy#2525](https://github.com/alchemy-run/alchemy/pull/2525). Remove the patch once a release includes it.
