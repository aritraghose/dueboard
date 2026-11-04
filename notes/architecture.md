# Dueboard architecture

How Dueboard is built: where data lives, how requests flow, how privacy is
enforced, and how Tibo (the AI agent) works. The product spec, decisions and
build order are in [planning.md](planning.md). Each build step has a prompt in
[prompts/](prompts/).

## 1. The one rule

> **Postgres is the source of truth for everything the user does. Tibo never
> owns that data: it reads and changes it through the same domain services the
> UI uses, as that user.**

There are two kinds of data, and each lives where it fits:

| | Postgres (Neon, via Hyperdrive) | A Durable Object per user (`TiboAgent`) |
|---|---|---|
| What | Tasks, habits, goals, notes, sessions, tags, settings, connections, activity, relays, usage | Tibo's single thread, memory, summaries, schedules, check-in log, live connections |
| Why | Social features read **across users** (Live, diaries, profiles). A relational database does that well. | One user's agent is one long-lived, stateful thing with its own storage, alarms and WebSockets. |

## 2. Components

```
 Browser ──POST /rpc──▶ Website Worker (web/) ──env.API──▶ ApiWorker (api/src/api.ts)
    │                    TanStack Start                     Effect RPC (cookie auth)
    │                    src/server.ts                            │
    │                    /agents/* proxy                          ▼
    │ WebSocket               │                          Domain services ──▶ Postgres (Neon)
    └────────────────────────▶│ env.AGENT                (one place for rules       ▲
                              ▼                           and permissions)          │
                     AgentWorker (api/src/agent.ts)            ▲                    │
                      ├─ TiboAgent DO (one per user) ──────────┘ DomainWorker      │
                      │   SQLite: thread, memory, summaries      (env.DOMAIN, RPC  │
                      │   alarms: proactive check-ins            only), as the DO's user
                      ├─ AskAgent (public Q&A, walled off) ── reads ONLY the owner's
                      │                                        ask settings ──────┘
                      └─ ⇄ other users' TiboAgent DOs (relays)
                     ApiWorker cron (every minute): auto-completes expired focus sessions
                     AgentWorker cron (every minute): delivers the tibo_events outbox, wipes deleted threads
                     AI Gateway (BYOK Meta key) ◀── every model call
                     Vectorize: Tibo memory embeddings (namespace = user id)
                     R2 TiboFiles (private): files sent in Tibo's chat, tibo/<user id>/<id>
```

### Workers (all created by Alchemy, none public except the Website)

| Worker | Stack | Role |
|---|---|---|
| **Website** | `DueboardWeb` (`web/`) | TanStack Start UI. Proxies `/rpc`, `/api/auth/*` and `/agents/*` to private Workers. |
| **ApiWorker** | `DueboardApi` (`api/`) | Effect RPC API + Better Auth. Hosts the domain services. `workersDev: false`. |
| **AgentWorker** | `DueboardApi` | Hosts `TiboAgent` and `AskAgent` Durable Objects. `workersDev: false`. |
| **DomainWorker** | `DueboardApi` | Tibo's private door to the domain services: Worker RPC methods only, no HTTP routes, bound into AgentWorker alone (`env.DOMAIN`). `workersDev: false`. |
| **Session sweep** (cron) | `DueboardApi` | A `* * * * *` cron on the ApiWorker itself (`Cloudflare.Workers.cron` in `api.ts`) that completes focus sessions whose time ran out. |

### Existing conventions to keep

- `api/src/rpc.ts` is the RPC contract shared by api and web, `api/src/api.ts` has the handlers, `api/src/schema.ts` the Drizzle tables, and `web/src/rpc-client.ts` the AtomRpc client.
- Every RPC runs as `CurrentUser` through the `Authentication` middleware, which also applies the per-user `RPC_RATE_LIMIT`. The one exception is the `PublicRpcs` group (merged into `ApiRpcs`, same `/rpc` endpoint): its `OptionalAuthentication` middleware provides `Viewer` (`{ user: … | null }`) and limits logged-out callers per IP.
- Better Auth owns its tables. Reference `user.id` as a plain `text` column with no foreign key (Drizzle migrations run before Better Auth's).
- Web reads bindings through `web/src/env.ts`.
- **Origin checks** (step 24, `web/src/server.ts`): every request that isn't `GET`/`HEAD`/`OPTIONS` (`/rpc`, server functions) and every `/agents/*` request must come from the site's own origin (`Origin`, or `Sec-Fetch-Site` when there's no `Origin`), else 403. Better Auth checks its own routes against `AUTH_BASE_URL`. The `/agents/*` proxy and the PDF upload read the session with `disableCookieCache`, like the RPCs, so a revoked or deleted session can't reopen an agent during the cookie cache's 5 minutes.
- Pathless route groups: `_public/`, `_auth/`, `_app/`. The `/rpc` and `/api/*` paths are reserved by the proxies.

## 3. Domain services layer

All business rules live in **domain services** in `api/src/domain/` (one module
per area: tasks, habits, goals, notes, sessions, tags, settings, social,
activity, visibility, usage). Each service function:

- takes the **acting user id** explicitly, and never trusts an id from the client body,
- validates input with Effect `Schema`,
- enforces ownership (`WHERE user_id = actor`) and the business rules,
- writes the matching `activity` rows in the same transaction.

Two callers use them:

1. **RPC handlers** (`api/src/api.ts`): `CurrentUser` from the cookie session.
2. **Tibo tools**: through an **internal service binding** from AgentWorker to
   the **DomainWorker** (`api/src/DomainWorker.ts`), a private Effect Worker
   with Worker RPC methods and no HTTP routes. Its `run(actorUserId, rpc,
   payload)` runs one of the same `ApiRpcs` handlers the UI calls
   (`api/src/handlers.ts`, shared with the ApiWorker), with the same payload
   decoding, for the RPCs in `TIBO_RPCS` (`api/src/domain-client.ts`) only. It
   is bound only to AgentWorker, never proxied by the Website, so a browser
   cannot reach it. The `TiboAgent` passes `this.name` (its own user id), so
   Tibo can only ever act as its own user. (Not an entrypoint on the
   ApiWorker: Alchemy's Effect Workers export only their default entrypoint,
   which the Website binds.)

Pure logic with no I/O, such as habit scheduling, visibility rules and date
math, lives in plain modules (`api/src/domain/*-rules.ts`) with `bun test` unit
tests. `bun test` is built in, so no test dependency is needed.

## 4. Data model (Postgres)

IDs are `text` holding `crypto.randomUUID()` (UUIDv4), made by the domain
services through `newId()` in `api/src/domain/database.ts`: no dependency, and
nothing reads order from an id (lists sort by a timestamp column). Every
user-owned table has `user_id text not null` plus an index that starts with it. Timestamps are `timestamptz` in UTC. **Calendar fields are
plain `date`**, interpreted in the owner's time zone.

### Shared enums

- `privacy`: `public` | `connections` | `private`. New items default to `connections`.
- `share_to_live`: boolean. New items default to `true`.
- Each user can change both defaults in settings.

### Tables

| Table | Key columns | Notes |
|---|---|---|
| `user_settings` | `user_id` PK, `time_zone`, `color`, `default_privacy`, `default_share_to_live`, `relay_policy` (`connections`\|`anyone`\|`none`, default `connections`), `ai_quota_override` (nullable) | Created on first sign-in or onboarding. `time_zone` is IANA (`America/New_York`). `color` is a random tag-palette key (never gray), assigned once when the row is created; Live shows the username in it. |
| `tags` | `id`, `user_id`, `name`, `color`, `system_kind` (`default`\|`habit`\|`goal`\|null) | Unique `(user_id, lower(name))`. System tags are seeded at onboarding. They can be recolored but not renamed or deleted. |
| `tasks` | `id`, `user_id`, `title` (1–200), `description?` (≤ 2000), `assigned_date?`, `deadline_date?`, `tag_id` (FK `tags`, restrict), `status` (`idle`\|`working`\|`settled`, default `idle`), `settled_at?`, `privacy`, `share_to_live`, `importance?` (1–5), `expected_minutes?` (1–1440) | `CHECK`s: `assigned_date <= deadline_date`; `settled_at` set iff settled; the ranges. Indexes `(user_id, assigned_date)`, `(user_id, deadline_date)`, `(user_id, status)`, `(user_id, created_at desc, id desc)`, and a partial unscheduled index. `tag_id` defaults to the user's `default` tag. `working` is only a label. |
| `habits` | `id`, `user_id`, `title`, `description?`, `schedule_kind` (`flexible`\|`specific_days`), `target_count`, `period_unit` (`day`\|`week`\|`month`), `period_length`, `weekdays smallint[]?`, `month_days smallint[]?`, `start_date`, `status` (`active`\|`paused`\|`archived`), `privacy`, `share_to_live` | Stores the **rule**. Nothing is generated ahead of time. Shown with the `habit` tag. `specific_days` stores `day` × 1 and exactly one non-empty day list (`CHECK`). Rules: `api/src/domain/habit-rules.ts`. |
| `habit_pauses` | `habit_id`, `start_date`, `end_date?` | Pause and resume history. A pause covers `[start_date, end_date)`, so the resume day is due again; at most one open (`end_date` null) per habit. `paused` and `archived` habits always have one open. A paused day is never due. |
| `habit_checkins` | `habit_id`, `user_id`, `local_date`, `count` | Unique `(habit_id, local_date)`. Each tap adds 1, and an undo subtracts 1 (a row at 0 is kept). Pauses and check-ins cascade when a habit is deleted. |
| `goals` | `id`, `user_id`, `name`, `description?`, `progress_mode` (`slider`\|`count`), `progress_percent`, `target_count?`, `current_count?`, `target_date?`, `status` (`active`\|`paused`\|`completed`), `completed_at?`, `privacy`, `share_to_live` | Progress can go down. Reopening sets `status = active` and clears `completed_at`. |
| `goal_links` | `goal_id`, `item_type` (`habit`\|`task`), `item_id`, `amount` (default 1) | A habit check-in adds `amount` per tap. Settling a task adds `amount`. Undoing reverses it. |
| `goal_progress_events` | `goal_id`, `user_id`, `delta`, `value_after`, `source` (`manual`\|`habit`\|`task`), `source_id?`, `source_date?`, `created_at` | Progress history, used by Live and for undo. `source_date` is a habit check-in's day: undos take back at most what that day (or task) added. |
| `notes` | `id`, `user_id`, `body` (1–60 chars, `CHECK`), `local_date`, `privacy`, `share_to_live`, `created_at`, `updated_at` | Several per day, at most 50. Written only for today in the user's zone; `local_date` never changes. Index `(user_id, local_date, created_at, id)`. |
| `focus_sessions` | `id`, `user_id`, `label?` (≤ 100), `planned_minutes` (1–600), `status` (`running`\|`paused`\|`completed`\|`stopped`), `local_date` (start day in the user's zone), `started_at`, `ends_at?`, `ended_at?`, `privacy`, `share_to_live` | **Partial unique index on `user_id` WHERE status IN ('running','paused')**, so the database enforces one active session. `ends_at` is set exactly while running and recomputed on resume and extend so the sweep can find expired ones; `ended_at` is set exactly once completed or stopped. |
| `focus_session_segments` | `session_id`, `started_at`, `ended_at?` | Pause and resume history. Elapsed time is the sum of the segments. |
| `activity` | `id`, `user_id` (actor), `kind`, `subject_type`, `subject_id`, `occurred_at`, `local_date`, `meta jsonb` | The single feed behind Live, diary and contribution graph (§5). Indexes on `(user_id, occurred_at desc)`, `(user_id, local_date)`, `(subject_type, subject_id)`, and `activity_points_idx` `(local_date, user_id)` over the scored kinds for the leaderboard (step 24; `habit_checkins_points_idx` is its twin). |
| `connection_requests` | `id`, `from_user_id`, `to_user_id`, `status` (`pending`\|`accepted`\|`declined`\|`cancelled`), `created_at`, `responded_at?` | Partial unique index: one `pending` row per ordered pair. Answered rows are kept (the 24-hour send cap counts them). `responded_at` set iff not pending (`CHECK`). |
| `connections` | `user_low`, `user_high` (ordered pair), `created_at` | PK on the pair, `CHECK user_low < user_high collate "C"` (byte order, matching JS `<`). Mutual. Removing a connection deletes the row. |
| `blocks` | `blocker_id`, `blocked_id`, `created_at` | PK on the pair. Hides everything both ways and blocks requests, relays and the Ask page. |
| `notifications` | `id`, `user_id` (recipient), `actor_id`, `kind` (`connection_request`\|`connection_accepted`), `request_id` (FK `connection_requests`, cascade), `created_at`, `seen_at?` | `domain/notifications.ts`. Written in the request's or accept's transaction; unique `(request_id, kind)`. Deleted both ways by a block. Indexes `(user_id, created_at desc, id desc)` and a partial unseen index. |
| `ai_usage` | `user_id`, `period` (`YYYY-MM` in the user's time zone), `units` | Quota ledger (§8). |
| `ai_usage_events` | `user_id`, `units`, `reason`, `ref?`, `created_at` | Audit log. |
| `relays` | `id`, `from_user_id`, `to_user_id`, `message` (1–1000), `status` (`pending`\|`delivered`\|`answered`\|`declined`\|`expired`\|`cancelled`), `answer?` (1–1000), `created_at`, `delivered_at?`, `answered_at?`, `expires_at` (7 days), `updated_at`, `sender_synced`, `recipient_synced`, `retry_at?` | §7.5. `CHECK`s: not to yourself, the lengths, `answer` iff answered, `answered_at` iff answered or declined. Deleted with either account. |
| `ask_settings` | `user_id` PK, `enabled` (default **false**), `instructions` (≤ 4000), `shared_context` (≤ 8000), `monthly_answer_cap` (the logged-out pool, 1–50, default 50), `updated_at` | §7.6. Created on the owner's first save. |
| `ask_usage` | `user_id`, `period` (`YYYY-MM`, owner's zone), `answers` | Logged-out answers only: the owner's Ask pool. PK both. |
| `ask_documents` | `id`, `user_id`, `name` (1–120), `text` (1–12,000), `created_at` | Ask page files as text only (§7.6). At most 2 per owner, counted under an advisory lock. |
| `ask_questions` | `id`, `user_id` (owner), `asker_id?` (signed-in visitor), `question` (1–500), `answer` (≤ 2000), `created_at` | The owner's question log (Settings → Ask page), kept 30 days: reads hide older rows and the ApiWorker's cron deletes them hourly. Deleted by a block between the two and with either account. |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at` | **Not built**: step 23 is paused (§12). Account deletion must add it to `USER_OWNED_TABLES` when it lands. |

### Time zones

- The browser reports `Intl.DateTimeFormat().resolvedOptions().timeZone` on
  every app load. If it differs from `user_settings.time_zone`, an RPC updates
  it, so travelling users follow their local day.
- "Today", diary days, `activity.local_date`, habit check-in dates and the
  quota month are all computed in the **user's** time zone.
- Weeks start on **Sunday** (US convention). Dates display as "Sun, Nov 1".

### What shows on a given day (for the owner)

- **Tasks**:
  - a task shows if `assigned_date = day` OR `deadline_date = day`;
  - on the deadline day, a task settled earlier appears under **Settled**;
  - **Unscheduled** (no dates) tasks show in their own section on `/now` and on `/tasks`;
  - overdue tasks are **not** carried over to later days.
- **Habits**: a habit is due if the rule engine says so for that day, it is not
  paused, and `day >= start_date`.
  - **Flexible** ("3× per week", "2× every 5 days", "10× per month") shows every
    day of its period until the period's target is met, with an "x of N this
    period" counter. It then moves to Settled for the rest of the period.
    Periods of `period_length` units are anchored at `start_date`. Weeks align
    to Sunday when `period_length = 1`.
  - **Specific days** (weekdays or month days) shows only on those days, with
    `target_count` taps needed each day.
  - **Daily with a count** is flexible with `day`, length 1, target N.
  - When every due habit is done, `/now` shows "All habits checked".
  - Streak = consecutive periods (or scheduled days) where the target was met.
- **Goals**: every `active` goal shows every day until completed. Paused goals are hidden from `/now`.
- `/now` reads a day in one call, `GetDay` (`domain/days.ts`), built from the per-type services above.
- **Upcoming** (`GetUpcoming`, from tomorrow, at most 60 days per call, empty days left out): open tasks on their assigned and deadline dates, specific-days habits on each scheduled day, flexible habits once per period on its first scheduled day in range (periods already met are left out), and active goals on their `target_date`.

## 5. Activity, privacy and visibility

### Activity kinds

These are written by the domain services in the same transaction as the change:

| kind | When | Reversed when |
|---|---|---|
| `task_settled` | status → settled | un-settled or deleted → row deleted |
| `habit_completed` | a check-in makes the period (or day) target reached. `meta` holds `periodStart`/`periodEnd`; `local_date` is the check-in's day. | an undo drops it below target → row deleted |
| `habit_checked` | a check-in on a day; one row per habit and day, moved to the latest tap, `meta.count`. Live hides it on a day `habit_completed` covers. | that day's count back to 0 → row deleted |
| `goal_progressed` | progress changes (manual or linked). At most one row per goal and local day, updated in place; `meta` holds `valueBefore`, `valueAfter`, `percent`. | the day's changes cancel out → row deleted |
| `goal_completed` | reaches 100% or the target count | reopened → row deleted |
| `session_started` / `session_completed` / `session_stopped` | lifecycle | session deleted → rows deleted |
| `note_created` | a note is written | note deleted → row deleted |

Deleting any item deletes its activity rows. **Activity rows never copy titles,
privacy or share flags.** Those are read from the item when the feed is
displayed, so a privacy change applies everywhere immediately.

### Visibility rules

These live in one module, `api/src/domain/visibility.ts` (pure rules in
`visibility-rules.ts`), and every reader must go through it. It also builds
the rules as SQL conditions (`canSeeItemSql`, `liveActorSql`, the
activity-subject joins), so readers filter in the database. The profile
tabs (`GetProfileItems`), the diary (`GetDiary`), Live (`GetLive`, `domain/live.ts`) and the leaderboard (`connectedSql`, `notBlockedSql`; step 24) use it. Relays, the Ask page and connection requests check blocks themselves, since they gate a write rather than show items:

```
canSeeItem(viewer, owner, privacy):
  blocked either way → false
  viewer == owner     → true
  public              → true            (including logged-out visitors)
  connections         → connected(viewer, owner)
  private             → false

live (viewer = signed-in user):
  actors   = viewer ∪ connections(viewer), minus blocked
  rows     = activity of actors where item.share_to_live = true
  display  = owner == viewer or privacy ∈ {public, connections} → full ("ar1tra settled a task: add rate limiter")
             privacy == private                                → redacted ("ar1tra settled a task")
  tabs     All → as above; Connections → connections(viewer); Me → {viewer}
  path     the viewer's own today, oldest first, whatever privacy or share flag
           (settled tasks, habits checked, goals moved, sessions completed)
  window   the last `days` days in the viewer's zone (2 on /now, 7 on /live)

diary (/diary for yourself, /@username for others; GetDiary, domain/diary.ts):
  rows where canSeeItem(viewer, owner, privacy), whatever share_to_live is
  kinds    settled tasks, completed habits, goal moves and completions, notes,
           completed and stopped sessions (a goal's move is hidden the day it completes)
  paging   by the owner's local_date, newest first, ≤ 7 days or ~60 entries a page

contribution graph:
  counts per local_date of task_settled, habit_completed, goal_completed and
  session_completed, INCLUDING private items (counts only, no details).
  session_stopped does not count. 53 Sunday-starting weeks ending on the
  owner's today (GetContributionGraph), read through
  activity_user_local_date_idx; no rollup table.
```

Strangers never see Live. They only see public diary items and the graph
on a profile.

### Points

Not stored: `domain/points.ts` counts them from rows the actions already
leave, so undos take them back. +1 per `task_settled`, per `goal_progressed`
row (one per goal and day), per `session_completed`, and per `habit_checkins`
row with `count > 0` (one per habit and day). Private items count, like the
graph. Leaderboard periods use the viewer's zone against each row's
`local_date`. If counting gets slow, a per-user, per-day table can replace it
behind the same RPCs.

### Fan-out

The feed is computed when it's read: a query over `activity` for the actor set,
ordered by `occurred_at` and paginated with a cursor. This is fine at v1 scale.
If it gets slow later, add a materialized per-user inbox.

## 6. Routes

| Path | Group | Notes |
|---|---|---|
| `/` | `_public` | Landing page |
| `/auth`, `/onboarding` | `_auth` | Existing. Onboarding also seeds tags and settings. |
| `/now` | `_app` | Replaces `/glance` (sign-in lands here). A date header with ← → and local time; Today's tasks, Unscheduled, Habits, Goals; a session widget; a collapsible Live card; an "Upcoming" view. |
| `/tasks` `/habits` `/goals` `/notes` `/sessions` `/diary` | `_app` | Full lists and history for your own data |
| `/inbox` | `_app` | Focused full-page Tibo chat |
| `/boards` | `_app` | Every board (Tasks, Habits, Goals, Notes, Live, Diary) as a card that opens it |
| `/live` | `_app` | Live, full-page: the feed of what you and your connections get done (it was called the timeline) |
| `/settings` | `_app` | Tabs: General (defaults, time zone display, theme), Connections (blocked list only), Tibo (relay policy, check-ins, memory), Ask page (switch, instructions, shared context, the logged-out pool, recent questions), Account (delete) |
| `/tags` | `_app` | Create, rename and recolor tags (built-in tags only recolor). Linked from `/tasks` ("Manage tags"). |
| `/notifications` | `_app` | Who asked to connect and who accepted your requests, newest first, with Accept / Decline on pending ones. Opening it marks them seen. Reached from the bell in the top row (left of Tibo; floating top right on phones), which shows the unread dot. |
| `/discover` | `_app` | People search, incoming requests, sent requests. In the desktop sidebar after Boards. |
| `/leaderboard` | `_app` | Points ranking: `?scope=public` (default Connections), `?period=all|month|today` (default This week). In the desktop sidebar after Discover. |
| `/connections` | `_app` | The user's connections, with Remove and Block. Opened from their own profile's connections count. |
| `/@username` | public-readable | Tabs `?tab=` Overview (default: counts and the graph), Tasks, Habits, Goals, Diary, Sessions. `routes/@{$username}.tsx` (literal `@` prefix + param), outside `_app`'s guard; signed-in viewers get the app chrome (`AppShell`). Profile card, contribution graph, diary filtered for the viewer. Logged-out visitors can view it. |
| `/@username/ask` | public-readable | Q&A with the user's Ask agent, only if they enabled it (the owner can always preview). `routes/@{$username}_.ask.tsx` (the `_` keeps it out of the profile's layout). Laid out like `/inbox`: Tibo floating at the top "Answers for @username", a profile button and (signed in) the bell. |

- The **Tibo button** sits at the top right of every `_app` page and opens a side panel with the same thread as `/inbox`.
- Usernames **cannot be changed**, so `/@username` links never break.
- TanStack Router's literal prefix before a param is the file name `@{$username}.tsx`; link with `to="/@{$username}" params={{ username }}`.

## 7. Tibo

### 7.1 Shape

- One `TiboAgent` Durable Object per user, named by user id. It extends the
  Agents SDK's base `Agent`, not `AIChatAgent`, because `AIChatAgent` keeps the
  whole history in memory and sends all of it to the model on every turn.
  Re-check the current SDK, including `@cloudflare/think`, when building.
- **One thread forever.** There's no "new chat" and no clear button.
- The browser connects through the existing `/agents/*` proxy in
  `web/src/server.ts`, which pins the instance to the session's user id. The
  path becomes `/agents/tibo-agent/<userId>`.
- The side panel and `/inbox` are two views of the same WebSocket thread, so
  every tab and device stays in sync.
- Model: **Meta Muse Spark 1.3 only** (`meta/muse-spark-1.3`) through AI
  Gateway with BYOK, through the Responses-format setup in `api/src/muse.ts` (moved out of `tibo/` in step 22, so the Ask agent imports nothing of Tibo's)
  (`@ai-sdk/openai` `.responses()` + `env.AI.run` with
  `openaiEndpoint: "/v1/responses"` + the `cf-aig-no-wholesale` header). The
  Agents SDK's `createAI` cannot read this model's replies.
- **Built (step 17)**: `api/src/tibo/` (`TiboAgent.ts`, `thread.ts`, `context.ts`,
  `bubbles.ts`, `persona.ts`, `protocol.ts`, `model.ts`); step 19 added
  `memory.ts`, `memory-rules.ts`, `memory-jobs.ts`, `recall.ts`,
  `embeddings.ts` and `dev-seed.ts`. Planning's decision log has the details. **Turn pipeline extension points** for steps 18 and 19:
  - `buildTurnContext({ persona, profile, now, recent, sections })` in
    `context.ts`: step 18 adds the today snapshot as a `section`; step 19 adds
    summaries and memories as more `sections` and may shrink `recent`.
  - `TiboAgent.reply` is where `streamText` is called: tools (and a step
    limit) go there in step 18, and the persona's `NO_TOOLS_YET` line is
    replaced by the tool rules. Tool steps should keep streaming text through
    the same `BubbleSplitter`.
  - `TiboAgent.turn` ends after the charge: step 19 schedules its summary and
    memory jobs there (DO alarms, never blocking the reply).
  - `Thread.search(query, limit)` (FTS5) is `search_conversation`'s backend.
  - `system_event` rows are already a role: steps 20 and 21 add them with
    `thread.add`, and they reach the model marked as app events.

### 7.2 Thread storage (DO SQLite)

- `messages`: `id`, `role` (`user`\|`tibo`\|`system_event`), `body`, `created_at`, `turn_id`, `meta`.
  - A Tibo turn can produce several **bubbles**, each stored as its own row.
  - `system_event` rows hold relays and proactive triggers. The app hides them (relays read as plain chat); the model reads them as app events.
- `messages_fts`: an FTS5 index over `body`, for keyword search over the archive.
- `summaries`: `level` (`day`\|`week`\|`month`\|`year`), `period_start`, `text`, `through_message_id`, `through_seq`, `updated_at`. PK `(level, period_start)`.
- `memories`: `id`, `text`, `kind` (`fact`\|`preference`\|`person`\|`event`\|`plan`), `importance` (1–3), `created_at` (when it was said), `updated_at`, `superseded_by?`, `source_message_ids`, `embedding_model?`.
- `message_chunks` (step 19): consecutive messages embedded together for search: `id`, `from_seq`, `to_seq`, `day`, `started_at`, `ended_at`, `text`, `embedding_model?`.
- `memory_state` (step 19): the jobs' watermarks (`summarized_seq`, `extracted_seq`, `chunked_seq`), the rollups due, the zone and first name, and today's background spend.
- **Vectorize** `TiboMemory` index (1024 dims, cosine; `MemoryIndex` in `AgentWorker.ts`), **namespace = user id**, metadata `type` (`memory`\|`message`), `kind`, `created_at` (all three metadata-indexed). Vector ids map back to rows: `m:<memory id>`, `c:<chunk id>`. A row's `embedding_model` is set once its vector is written; a row whose model isn't `EMBEDDING_MODEL` is re-embedded by the jobs (how a model change would migrate, into a new index).
- Every message is kept forever. Nothing is truncated.

### 7.3 Building context for each turn

Context is assembled from scratch on every turn and never includes the whole history:

1. **Persona and rules**: the system prompt (§7.7).
2. **Today snapshot**: today's tasks, due habits and progress, active goals, the running session, the time and date in the user's time zone. Fetched from domain services.
3. **Story so far**: the latest year, month, week and day summaries (in-progress ones marked "so far"), plus last year's if it fits, compact.
4. **Relevant memories**: the top memories by meaning (Vectorize, namespace = user id) for what the user wrote since Tibo last spoke, plus their newest importance-3 memories. Superseded memories are excluded. Each has a per-turn ref (`m1`…) for `remember`/`forget`.
5. **Recent window**: the last ~40 messages, verbatim.
6. **Tools** (§7.4), including `search_conversation(query, from?, to?)` for exact old messages ("what did I say in 2025…"), `remember` and `forget`.

Everything but tools fits `CONTEXT_BUDGET_TOKENS` (12,000, estimated at 4 characters a token): the story (1,600) and memories (900) are capped where they're built (`tibo/recall.ts`), and the recent window drops its oldest messages to fit, never below 10. Under `alchemy dev` each turn logs `Tibo context tokens` per section, tools included.

Background jobs (`tibo/memory-jobs.ts`), on Agents SDK schedules (one ~60 s after turns, one when a quiet thread settles, one 5 min past the user's midnight, and a 15-minute watchdog set by every run in case the agent restarts mid-run), never blocking the reply. The schedule callback returns at once and the run continues under `keepAliveWhile`: a callback running past 30 s holds up the agent's other jobs, and each Muse call takes 5–45 s (2-minute timeout).
- **Extract memories**: from each 16 new messages (or fewer once the thread has been quiet 20 minutes), one Muse call proposes memories; each is embedded (Workers AI `@cf/qwen/qwen3-embedding-0.6b`, chosen in step 19) and compared with similar stored ones (cosine ≥ 0.5, plus ones written in the last 10 minutes that Vectorize may not show yet); if any are similar, a second call decides add, duplicate or supersede. Superseded memories keep their row (`superseded_by`) and lose their vector.
- **Summarize**: each finished day (or today past 60 messages) into a day summary; a finished day marks its week and its month due, and a rolled month its year. Months roll up from their own days, not from weeks: a week can straddle two months, and rolling weeks into the month they start in put March 2 in February in testing. So an in-progress week, month and year are rewritten at most once a day.
- **Chunk and embed**: the thread in chunks of up to 8 messages or 1,500 characters, never across a day, for `search_conversation`.
- **Costs**: Muse Spark only, never charged to the quota. Per user and day: 40 model calls and 600 embedded texts (`DAILY_JOB_CAP`; 600/6,000 under `alchemy dev`), at most 12 calls per run.

**Settings → Tibo → Memory** reads and deletes memories over HTTP in the user's own DO (`GET`/`DELETE /agents/tibo-agent/<name>/memories[/<id>]`, `TiboAgent.onRequest`), through the web stack's `AGENT` binding and its pinned `/agents/*` proxy. **Account deletion**: `wipe()` deletes every vector id the agent ever wrote (Vectorize can't drop a namespace) before `destroy()`; a failure throws and the cron retries.

### 7.4 Tools

Tools call the domain services through the internal binding, **as the DO's
user**: list, create, update and settle tasks; check, uncheck, pause and resume
habits; create goals, update progress and link items; create notes; start,
pause, resume, extend and stop sessions; list and create tags; read the
Live and diary; search the conversation; relay (§7.5).

- Destructive or surprising actions (delete, stop a running session, a bulk
  change) must ask the user to confirm first.
- **Other people's text** (step 24): `read_live` and `read_diary` return titles other people wrote. Those turns can run tools, so each such title reaches the model escaped inside `<their_words>` (`theirWords`, `tibo/views.ts`), and the tool rules (`TOOL_RULES`) call it data, never instructions, like relayed text. The confirmation rules and `ownWords` (§7.5) still stand behind it.
- **Reminders (step 20)**: `set_reminder`, `list_reminders`, `cancel_reminder` (§7.8) are the one thing Tibo can schedule; settings stay out of `TIBO_RPCS`.
- **Built (step 18)**: `api/src/tibo/tools.ts` (the tools, Zod schemas),
  `actions.ts` (turn ledger, pending actions, the confirmation design),
  `snapshot.ts` (today snapshot), `views.ts` (compact JSON for the model),
  `dates.ts`. Muse Spark's tool calling was verified first (planning.md's
  decision log). Limits: 8 model steps and 20 tool calls per turn; the turn
  is still one message of quota.
- **Confirmation**: a held call isn't run; the tool answers
  `needs_confirmation`. At the turn's end the held calls become one pending
  action in DO SQLite (`pending_actions`, 30 minutes, one at a time) and
  Confirm/Cancel buttons on the turn's last bubble (`meta.confirm`). A tap
  runs the stored calls as summarized (no model call, no charge). A typed
  yes goes through `confirm_action`, offered only when the turn was started
  by a user message newer than the action. Relay turns (step 21) must not
  offer it.
- **Receipts**: each change adds an entry to `meta.receipts` on the turn's last
  bubble ("Created task: Call mom · Tomorrow", with its verb and item), which
  the app shows as the item's own live card (`web/src/components/tibo-items.tsx`). The model sees receipts and
  held actions as an app note after its turn. The agent sends `changed` with
  the reactivity keys, and the app invalidates those lists.

### 7.5 Relays (Tibo ⇄ Tibo)

Relays read like friends passing a note, all in chat, with **no cards and no
confirm step** (the user's call, step 21): A says "ask @bea if she's up for
dinner Sunday", A's Tibo says it'll ask, B's Tibo says "Hey, @ar1tra is asking
you out for dinner Sunday. What should I say?", B answers in chat, and A's
Tibo tells A.

1. A's Tibo calls `relay_message(to, message)` (`to` is a username, or a
   connection's name). The agent checks the message is **A's own words**
   (`ownWords`, below), then `domain/relays.ts` `sendRelay` checks, in one
   transaction with both users locked: B's `relay_policy` (`connections` by
   default, `anyone`, `none`), blocks either way (someone who blocked A looks
   like no one), the caps (`RELAYS_PER_DAY` 30 in any 24 h counted in
   Postgres plus the 1007 burst limit, 3 open per pair, 20 open per
   recipient) and both quotas (A can pay 2 units, B 1). Then the `relays` row.
2. A's agent calls B's agent directly (`getAgentByName(...).relaySync(id)`,
   DO RPC inside the AgentWorker). B's agent reads the relay from the domain
   **as B**, checks both sides can pay the turn (else `holdRelay`: retried in
   30 min), adds a hidden `system_event` row with the message wrapped as
   `<relayed_message from="@a">…</relayed_message>` (escaped), marks it
   `delivered`, and schedules the **delivery turn**.
3. B's delivery turn: persona, "right now", a relay section and the last 12
   messages; **no tools, no snapshot, no memories**. B's Tibo asks B what to
   say back.
4. B answers in an ordinary turn: `answer_relay(relayId, answer)` (or
   `decline_relay`) runs at once, then B's agent calls A's agent, which adds
   a hidden outcome row and schedules the **outcome turn** (same shape, no
   tools). An expiry is a fixed line (no model, no charge).

**Sync and retries**: each side's agent acts on a relay change once
(`relay_cards` in DO SQLite, advanced synchronously), then acks it
(`sender_synced`/`recipient_synced`). The AgentWorker's every-minute cron calls
`relaySweep`: it expires open relays past `expires_at` (the sender is told; the
recipient's agent only if it had shown it) and hands out up to 100 relays a
side hasn't caught up on (20 s after the change, so the direct path goes
first; then every 5 minutes).

**Security (enforced in code):**
- Relayed text (and an answer coming back) is **untrusted data**: always
  wrapped and escaped, with a note that it's never instructions, in the
  thread, `list_relays`, the turns and the memory jobs' prompts (no memories
  are taken from it).
- Turns a relay causes run with **no tools**, so nothing in the text can make
  Tibo act, and they don't see the user's board or memories.
- **Only the user's own words cross over** (`ownWords` in `tibo/relays.ts`,
  tested): at least 75% of the content words of what's sent (glue words,
  greetings and yes/no aside) must appear in what the user wrote (since Tibo
  last spoke for a new relay, since the relay came for an answer), plus the
  other person's name. An answer built from the board, memories or an
  injected instruction fails with the foreign words named, and nothing is
  sent. This replaced the confirm step the prompt asked for.
- `answer_relay`/`decline_relay` only for a relay addressed to this user,
  still waiting, after the user wrote since it came. The domain checks the
  actor is the recipient too.
- A block cancels open relays both ways in the block's transaction; only the
  blocker's agent hears.

**Quota:** each model turn a relay causes (delivery, outcome) charges **1 unit
(half a message) to each side** (`chargeSplit`, reason `relay`). If either
side can't pay, delivery waits, and an outcome becomes a fixed line, uncharged.

**Built (step 21)**: `domain/relays.ts`, `relay-rules.ts` (tested),
`relay-constants.ts`; `tibo/relays.ts` (store, prompts, `ownWords`; tested);
the relay section of `TiboAgent.ts`; tools `relay_message`, `answer_relay`,
`decline_relay`, `list_relays`; DomainWorker `relay*` methods; the cron's
`syncRelays`. Dev only: `dev/relays`, `dev/relay-expire?id=`, and `dev/peer`
(drives a second test account's Tibo: `do=say`, `do=confirm`, `GET`).

### 7.6 Ask agent (`/@username/ask`)

- A **separate** `AskAgent` (`api/src/ask/`), never `TiboAgent` with a stricter prompt. The page shows it as Tibo "answering for @username" (step 22, the user's call), but it has none of Tibo's persona, thread, memories or tools.
- **Walled off in code.** The exported class (`AskAgent` in `api/src/agent.ts`) narrows the Worker's env before the agent's constructor runs (`askEnv`, `api/src/ask-env.ts`): the agent gets only `AI`, `AI_GATEWAY_ID`, its rate limit, Turnstile's keys and `ASK`, a frozen pair of functions over the DomainWorker (`askPort` in `domain-client.ts`). No `DOMAIN` binding, no Tibo agents, no memory index. `ask/walls.test.ts` fails if a module in `ask/` imports from `tibo/`, the domain services or `cloudflare:workers`, or names those bindings, and checks the env's keys.
- **The two domain calls** (`domain/ask.ts`, through `DomainWorker.askPrepare`/`askRecord`): `prepareAsk(username, visitorUserId)` gates the question and returns only the owner's display name, username, `instructions` and `shared_context`; `recordAsk` charges, counts and logs one answer in one transaction.
- **One DO per (owner, visitor)**, named `<username>~u.<user id>` (signed in and onboarded) or `<username>~v.<uuid>` (an HttpOnly `__Host-dueboard-ask` cookie, 30 days). The website's proxy computes the name; the client never sends one. HTTP only: `GET …/thread`, `POST …/ask` (`ask/protocol.ts`, `@dueboard/api/ask`).
- **Short-lived**: an expiry schedule checks idleness and `destroy()`s the DO after **1 hour** without a visit (its exchange, Turnstile pass and counts). Nothing goes into the owner's Tibo thread. Account deletion relies on this: Ask instances can't be listed by name, so a deleted owner's or visitor's exchanges live at most an hour past their last visit (step 24).
- **Who pays** (step 22, the user's call): a **signed-in visitor** pays from their own AI quota (2 units, `ask_answer`, charged to them). A **logged-out visitor** uses the owner's **Ask pool**: `monthly_answer_cap` answers a month (1–50, default 50, owner's zone), counted in `ask_usage`, separate from the owner's own quota. The owner previewing their page (allowed even while it's off) pays like any signed-in visitor.
- **Checked before every model call, in order**: the question (1–500 characters), one at a time per visitor, the burst limit (1009, by visitor, and by IP when logged out so a fresh cookie doesn't reset it), 10 an hour per visitor and owner (DO storage), **Turnstile** on the first question of a visitor session, then `prepareAsk`: on (or the owner), no block either way, and the payer has room. Refusals are fixed lines: "not available", "unavailable right now" (the pool ran out, or the model failed), "you've used your requests" (a signed-in visitor's own quota), "you've asked a lot". No details leak.
- **Turnstile**: `AskTurnstile` (`Cloudflare.Turnstile.Widget`, managed, for `AUTH_BASE_URL`'s hostname) is created by deploys; its secret is bound as `secret_text` (`TURNSTILE_SECRET`), its sitekey goes to the page in the `thread` answer. Siteverify runs in the agent (`ask/turnstile.ts`, tested): `success`, action `ask` and the site's hostname, failing closed. Under `alchemy dev`, Cloudflare's test keys stand in and the hostname isn't checked. The page loads `api.js` from `challenges.cloudflare.com` (the one external script, approved for this page only) right before the first question.
- **The turn**: one `generateText` call, no tools, Muse Spark through `museSpark` (gateway metadata `ask:<username>`, purpose `ask`). The system prompt (`ask/prompt.ts`, tested) answers only from the escaped `<owner_instructions>` and `<owner_context>`, says "I don't know — you could reach out to @username directly" otherwise, never invents, never guesses the owner's pronouns, and treats the visitor's `<visitor_question>` turns (escaped) as untrusted. The last 6 exchanges go along for follow-ups.
- **Files** (step 22 follow-up): the owner can add up to 2 PDFs (a CV), 4 MiB each. The website's `POST /api/ask-documents/convert` (`web/src/server.ts`: same origin, onboarded users, limit 1013 per user, `%PDF-` only) turns one into text with Workers AI `toMarkdown` (no metadata, embedded images not converted) and keeps nothing; `documentText` (`domain/ask-rules.ts`, tested) drops the converter's headings and cuts it to 12,000 characters. The owner reads and can edit that text, and `AddAskDocument` saves only the text (`ask_documents`). `prepareAsk` passes the files' names and text to the agent, which reads each in an escaped `<owner_document>` as facts, never instructions. Ask page only; Tibo's own chat doesn't see them.
- **Owner visibility**: every answered question goes to `ask_questions` (with who asked when signed in) and shows in Settings → Ask page for 30 days. The page tells visitors the owner can read them.

### 7.7 Persona

- Tibo is quirky, overconfident, funny and a little unhinged: a chaotic best friend who still gets things done.
- **No swearing.** It is not based on any existing character, so no catchphrases or references.
- It drops the act and is direct and kind if the user seems to be in real distress.
- It replies in short, chat-like bubbles, through a `send_message` tool called once per bubble or a delimiter that the server splits.
- The UI shows a typing indicator while Tibo works and between bubbles, with delays based on bubble length.

### 7.8 Proactivity

- `TiboAgent` uses Agents SDK scheduling (DO alarms) for:
  - a morning plan;
  - deadline nudges;
  - an evening habit check;
  - ~~session-ended messages~~: dropped in step 20 (it read as nagging).
- Domain changes can wake it through the internal binding.
- ~~A small daily cap on Tibo-initiated messages~~: dropped in step 20 at the user's request. Check-ins draw on the same monthly quota as every other request, and the user turns them off in Settings.
- Delivery is in-app until web push exists (built last).
- **Built (step 20)**: `api/src/tibo/proactive-rules.ts` (pure, tested), `proactive.ts` (DO SQLite), the check-in section of `TiboAgent.ts`, `domain/tibo.ts` (settings read, outbox), `domain/tibo-constants.ts`.
  - **Settings**: `user_settings.tibo_*` columns (master switch, one per kind, morning and evening times on the half hour), part of `Settings`/`SettingsPatch`, edited in Settings → Tibo → "Tibo messages you first". The agent reads them with `DomainWorker.tiboProactive` (profile plus settings).
  - **Alarms**: Date schedules (`proactiveFire`, payload `{ kind, at, day }`, idempotent), computed in the user's zone per day (`instantIn`), so DST moves the instant, not the local time. Cron schedules weren't used: the SDK's are UTC. `planProactive` cancels and re-arms all three; each alarm re-arms its own kind at its next slot. A fired alarm whose settings fingerprint (settings plus zone) no longer matches re-plans and is sent only if its slot still stands.
  - **Domain → agent**: the `tibo_events` outbox (`settings_changed` from `updateSettings` and `syncTimeZone`), written in the change's transaction and drained every minute by the AgentWorker's cron (`DomainWorker.pendingTiboEvents`/`tiboEventsDone` → `TiboAgent.deliverEvents` over DO RPC), which re-plans the alarms. Neither the ApiWorker nor the DomainWorker can call the agent (the AgentWorker binds the DomainWorker, so a binding back is a cycle). Undelivered events are retried each minute and dropped after a day. Finished focus sessions send nothing.
  - **Rules** (`gate`, in order): master and kind switches; stale (more than 30 min past its time: missed alarms never send late); dormant (no app visit for 7 days pauses the timed kinds); a turn running; quiet (a user or Tibo message in the last 10 minutes). Then something worth saying (`checkInFocus`), then the quota (`check`, 2 units). No count limit: each timed kind comes at most once a day by its slot. Skips are silent and final for that slot. `proactive_log` (one row per slot or session, `claim` first) stops repeats.
  - **Reminders** (`tibo/reminders.ts`): `set_reminder({ date, time, about, message })`, `list_reminders`, `cancel_reminder` — the one thing Tibo may schedule from chat (settings stay out of `TIBO_RPCS`). Stored in DO SQLite `reminders`, each with its own `reminderFire` alarm. Tibo writes the words when it's set; the alarm sends them as a Tibo bubble after a typing pause, with no model call and no charge, and none of the check-in rules (the user asked). At most 25 pending, a year ahead; one delayed more than 6 hours is marked missed.
  - **Turn**: a `system_event` row (hidden in the app) records the trigger, the context is the usual one plus a "You're messaging first" section, no tools, bubbles stream to every tab. Charged `tibo_proactive` (2 units) once a bubble showed; a turn that showed nothing deletes its event row. `notifyUser` is step 23's push seam.
  - **Unread**: `agent_state.read_seq`; `history` carries `unread`, the client sends `read` while a thread is on screen and the agent broadcasts it, so a check-in sent while the app was closed lights the dot on the next visit, on every device.
  - **Dev**: `POST …/dev/check-in?kind=<kind>[&bypass=quiet,stale|all]` runs one now through the same rules; `POST …/dev/alarm?kind=<timed kind>&at=HH:MM` arms a real alarm at any minute today; `GET …/dev/check-ins` shows the plan, armed alarms, log, pending reminders and usage.

### 7.9 Files in the chat

The user can send Tibo any file: images, PDFs, text and code, office documents, anything else (asked for after step 24).

- **Storage**: the private R2 bucket `TiboFiles` (`AgentWorker.ts`): no public access, no custom domain, no CORS, no S3 credentials, bound to the AgentWorker alone (`TIBO_FILES`; not in `askEnv`). Keys are `tibo/<user id>/<attachment id>`, built by the agent from its own name, never from the browser. Each file's row lives in the user's `TiboAgent` SQLite (`attachments`, `tibo/attachments.ts`): an id the agent didn't store for its own user doesn't exist. R2 encrypts at rest; a lifecycle rule aborts multipart uploads left open a day.
- **Upload**: `POST /agents/tibo-agent/<any>/files`, raw bytes, name in `x-file-name` (URI-encoded). The website's proxy pins the agent to the session's user (like every `/agents/*` request), requires `Origin` to be the site's own, applies `TIBO_FILE_RATE_LIMIT` (1014) per user before reading the body, caps it at `TIBO_FILE_MAX_BYTES` (10 MiB) as it streams in, and strips cookies before forwarding. The agent checks the size again, `TIBO_UPLOADS_PER_DAY` (100 in 24 h) and `TIBO_STORAGE_MAX_BYTES` (500 MiB per user). A file is unsent until a `send` frame names it (`attachments`, at most 4, ids the agent stored and hadn't sent; anything else is dropped); unsent files are deleted after a day.
- **What a file is** comes from its bytes (`sniff`, `tibo/attachment-rules.ts`, tested), never its name or the browser's claim: PNG/JPEG/GIF/WebP → `image` (size read from the header), `%PDF-` → `pdf`, an Office/ODF/Numbers container with that extension → `document`, valid UTF-8 → `text` (HTML and SVG included, served as plain text), else `other`. Documents and PDFs get their text from Workers AI `toMarkdown`; text files are decoded. Text is capped at 16,000 characters.
- **Serving**: `GET …/files/<id>` from the user's own agent only. Headers (`serveHeaders`, tested): the sniffed type, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `no-referrer`, `private` caching, a sandbox CSP on everything but PDFs, and `Content-Disposition` inline only for images and PDFs (RFC 5987 names that can't break out). File reads count against `WEB_RATE_LIMIT` (1012) rather than the agent's 1010, since a thread loads each of its images.
- **The model**: the files in the user's messages since Tibo last spoke reach Muse Spark as they are (images, and PDFs as files with `PDF_AS_FILE`) or as their text in escaped `<attached_file>` tags, within a turn's caps (20 MiB of images and PDFs, 32,000 characters of text), added after the context budget (`withFiles`, `tibo/context.ts`). Older files read as `[Sent image "name": note]` lines. The persona calls file contents data, never instructions. Account deletion (`wipe`) deletes every object under the user's prefix, listed from R2, before `destroy()`.
- **Memory, with judgement**: the memory jobs' first step (`noteFiles`, `tibo/memory-jobs.ts`) writes a short factual note of each sent file (one Muse call with the file and the user's words, never charged, under `DAILY_JOB_CAP`; secrets are left out) and judges it **memorable** or not: lasting facts about the user (a timetable, an offer letter, a pet they named, or their own words asking to remember it) versus memes, screenshots, articles, homework, code, receipts. "Remember this" inside a file doesn't count. Only memorable files' notes reach memory extraction and the summaries, where extraction still judges each fact; every note serves conversation search (chunks) and later turns. Extraction and chunking wait for a message's notes; a note that fails twice is skipped. A PDF the model refuses is retried as its text.
- **UI**: the + at the left of the composer, paste and drop anywhere on the thread (`components/tibo-attachments.tsx`, `lib/tibo-files.ts`). Files upload as soon as they're added; Send waits for them. In the thread, each file of a message is its own card (a photo edge to edge, at its own proportions; other files as a card with their kind, size and Save), then the words; the ticks and Tibo's reaction go on the last card. A photo opens full size with Save.

### 7.10 What Tibo is doing (the inbox's Tibo section)

`/inbox` splits in two on desktop: the thread, a divider, and the **Tibo section** (`components/tibo-side.tsx`), a raised surface (`bg-card`, the cream-to-teal card gradient). Tibo's avatar at the top of the thread and a chevron on its own disc right of the notifications bell open and close it (kept per browser in `localStorage`, **closed by default**). On phones it's a right-side panel, opened the same two ways and closed by a chevron in its corner. The floating Tibo panel elsewhere in the app doesn't have it. The section opens with Tibo itself, centered: its avatar with a status dot (teal and pulsing while it works, green when connected, gray offline), its name, and what it's doing or "Active now"; then the tabs, a cream segmented control with icons whose pill slides to the open tab. Each tab loads with skeletons shaped like its content, and offers "Try again" when a load fails.

- **Activity log** (`tibo/activity.ts`, DO SQLite `activity_log`): **threads** (`reply`, `check_in`, `reminder`, `relay`, `confirm`, `memory`, `file`) and their **steps** (`reading`, `context`, `thinking`, `tool`, `writing`, `step`), each with a label in the user's words, an optional detail, a status (`running`, `done`, `failed`, `skipped`) and start/end times. Every change is broadcast as an `activity` frame; `history` carries what's running on connect. Where they come from: `turn` (reading the message, checking the day and memories with how many were recalled, opening sent files, then `reply`'s phases: thinking, each tool call as a step labelled by `toolLabel` with its receipts or "Waiting for your go-ahead" as the detail, writing until the last bubble lands; skipped when rate-limited or out of messages), check-ins, reminders, relay turns, confirmed actions (one step per held call), the memory jobs (a thread only once a run does real work, via `JobContext.progress`: looking at a file, picking out memories, summarizing a period, indexing; its detail says what it learned), and reading an uploaded document. Running rows left by a restart end as failed ("Interrupted") in `onStart`. Kept 60 days or 3,000 threads.
- **Routes** (through the session-pinned proxy, the user's own agent only): `GET …/activity?before=<ms>` (threads with steps, newest first, 30 a page) and `GET …/files` (the files sent in the chat, newest first, at most 500).
- **Tabs**: **Overview** (default): what Tibo is doing now (`currentActivity`, `tibo/protocol.ts`: the newest running step, else thread), large, with how long and the steps so far; when free, its last thread; then the last few threads. What goes below "now" is still the user's call (the recent list is a placeholder). **Media**: photos (a grid, opening full size) and files sent in the chat. **Memory**: the same list as Settings → Tibo (`components/tibo-memory-list.tsx`), with delete. **Activity**: every thread by day, its steps on a rail with durations and details, newest first, with "Show older"; live frames are merged into the loaded pages (`hooks/use-tibo-activity.ts`).

## 8. AI usage quota

- Every **AI message** counts against one shared monthly quota per user:
  - a Tibo reply turn,
  - a proactive message,
  - a relay turn,
  - an Ask-page answer (to the signed-in visitor who asked).
- One reply turn counts as one message, however many bubbles it has.
- Internal background jobs (summaries, memory extraction) do not count, but they have their own internal budget.
- The ledger stores **units**: 1 message = 2 units, so a relay turn costs 1 unit (half a message) to each user.
- The limit is `AI_MONTHLY_MESSAGE_QUOTA` (config, default **150** since step 22; it was 300), overridable per user (`user_settings.ai_quota_override`). Changing it never needs a code change.
- **Ask answers** (step 22): a signed-in visitor's answer is charged to the **visitor** (2 units, `ask_answer`). A logged-out visitor's answer uses the owner's separate Ask pool (§7.6), not anyone's quota.
- The check happens **before** a model call. Usage is recorded after it succeeds.
- **At the limit**:
  - the composer disappears;
  - a notice styled like a Tibo bubble says the limit is reached and more usage is coming soon;
  - the notice is built **in the UI only**: never stored in the thread, memory or database.
- Pricing will come after product-market fit. Keep the ledger shaped so plans and per-plan quotas can be added later.
- **Built (step 16)**:
  - **Tables**: `ai_usage` (`user_id`, `period` `YYYY-MM` in the user's zone, `units`; PK both) and `ai_usage_events` (`id`, `user_id`, `units`, `reason` `tibo_reply`|`tibo_proactive`|`relay`|`ask_answer`, `ref?`, `created_at`).
  - **Domain** (`domain/usage.ts`, pure rules in `usage-rules.ts`): `getUsage(userId)` → `AiUsage { used, limit, remaining, period, resetsAt }` in whole messages; `canSpend(userId, units)`; `recordUsage(userId, units, reason, ref?)` (atomic upsert plus an event, returns the new usage); `chargeSplit(userA, userB, unitsEach, reason, ref?)` (one transaction). The quota comes from the `AiQuota` service, which the ApiWorker reads from `AI_MONTHLY_MESSAGE_QUOTA` (Effect `Config`, default 300).
  - **Callers outside the ApiWorker** use the DomainWorker's `usageGet`, `usageCheck`, `usageRecord` and `usageChargeSplit` methods through `usageClient(env.DOMAIN)` (`api/src/domain-client.ts`). Step 18 replaced the ApiWorker's `/internal/*` path with them; it no longer exists.
  - **Chat contract** (kept by step 17's `TiboAgent`): before the model call, `check(user, 2)`; out of quota, the agent sends `limitReached` and makes no model call. Once a bubble or reaction was shown, `record(user, 2, "tibo_reply", turnId)`. The UI hides the composer when the usage is 0 or `limitReached` arrives, and shows its own notice.

## 9. Rate limiting and abuse protection

These are Cloudflare Rate Limiting bindings. Each `namespaceId` must be unique in the account. **The registry is `api/src/limits.ts` (`LIMITS`)**: every binding's name, namespace, limit, period, key and place. Both stacks build their bindings from it (`bindingProps`), and the website imports it through `@dueboard/api`. Keep this table in sync with it.

| Namespace | Key | Limit | Where |
|---|---|---|---|
| 1003 `AUTH_RATE_LIMIT` | IP | 30/min | Website: `/api/auth/*` (`routes/api/auth/$.ts`) |
| 1004 `RPC_RATE_LIMIT` | user | 120/min | ApiWorker: every authenticated RPC (`Authentication`), and `PublicRpcs` for signed-in viewers |
| 1005 `CHAT_RATE_LIMIT` | user | 10/min | AgentWorker: Tibo turns (`TiboAgent.turn`) |
| 1006 `CONNECTION_REQUEST_RATE_LIMIT` | user | 5/min burst, plus 20 per 24 h counted in Postgres | ApiWorker: connection requests (`social.ts`, via `RateLimiter`) |
| 1007 `RELAY_RATE_LIMIT` | user | 5/min burst, plus 30 per 24 h counted in Postgres | DomainWorker: relays sent (`domain/relays.ts`, via `RateLimiter`) |
| 1008 `PUBLIC_READ_RATE_LIMIT` | IP (`cf-connecting-ip`) | 60/min | ApiWorker: `PublicRpcs` for logged-out visitors |
| 1009 `ASK_RATE_LIMIT` | visitor (user id or cookie id), plus IP when logged out | 3/min burst, plus 10 per hour per visitor and owner counted in the agent | AgentWorker: `AskAgent`, before each model call; Turnstile on a visitor's first question |
| 1013 `ASK_DOCUMENT_RATE_LIMIT` | user | 5/min | Website: `/api/ask-documents/convert` (PDF to text for an Ask page), after the session lookup (`src/server.ts`) |
| 1010 `AGENT_RATE_LIMIT` | IP | 60/min | Website: `/agents/*` WebSocket upgrades and HTTP, before the session lookup (`src/server.ts`) |
| 1011 `PEOPLE_SEARCH_RATE_LIMIT` | user | 30/min | ApiWorker: people search (`SearchPeople`, via `RateLimiter`) |
| 1012 `WEB_RATE_LIMIT` | IP | 300/min | Website: everything else its Worker serves (`/rpc` signed in or out, page loads, server functions such as `getSessionUser`, and `GET` of Tibo chat files), before any session lookup (`src/server.ts`) |
| 1014 `TIBO_FILE_RATE_LIMIT` | user | 10/min | Website: `POST /agents/tibo-agent/*/files` (a file for Tibo's chat), after the session lookup and before the body is read (`src/server.ts`); the agent also caps uploads a day and storage (§7.9) |

- The binding only counts per 10 or 60 seconds, so daily caps are counted in Postgres by the service. Limits a domain service checks itself go through the `RateLimiter` service (`domain/rate-limiter.ts`), so Tibo's tools hit them too.
- **Paths audited (step 16)**: `/api/auth/*` (1003), `/rpc` (1012 per IP first, then 1004 or 1008), `/agents/*` (1010, then 1005 per chat turn), the public profile `/@username` (its SSR page load and server function under 1012, its reads under 1008/1004). Static assets are served before the Worker runs.
- **Tibo's WebSocket frames** (step 24): beyond chat turns (1005), each socket may send 60 frames per 10 seconds (`FRAME_BUDGET` in `TiboAgent.ts`, in memory); paging, reactions, read marks and confirms past that are dropped.
- **Namespaces are per account, not per stage**: every stage on the account shares each counter, keyed by IP, user id or visitor id. User and visitor ids differ between stages, so only the per-IP limits (1003, 1008, 1010, 1012) are shared, for example by one tester using dev and staging at once.
- **Input sizes**: every RPC input `Schema` string and array has a `maxLength` (`domain/model.ts`). The website reads each request body up to `MAX_REQUEST_BODY_BYTES` (64 KiB) and answers 413 beyond it. Chat messages are capped at `MAX_CHAT_MESSAGE_LENGTH` (4000 characters) by the composer and the agent.

## 10. Realtime

- **v1**: AtomRpc queries refetch after mutations. Live polls every
  30–60 s while visible. The session timer counts down in the browser from
  `ends_at`. Tibo is realtime through its WebSocket.
- **Later**: a per-user realtime channel if needed.

## 11. Focus sessions

- Starting a session while another is running or paused shows a warning: the
  other will be **stopped** automatically. Confirming stops it and starts the
  new one in one transaction.
- Pause closes the current segment. Resume opens a new one and recomputes
  `ends_at`. Extend adds minutes and recomputes `ends_at`.
- **Auto-complete**: a cron sweep every minute completes `running` sessions
  whose `ends_at <= now()` and writes `session_completed`. Tibo sends no
  message about it (§7.8). Reads also complete them lazily, so the UI is
  right even between sweeps.

## 12. Web push (paused)

Step 23 was paused on 2026-11-04 before anything was built; `notifyUser` (§7.8) is the seam. The plan stands:

- VAPID keys are stored as Alchemy secrets.
- The service worker is a local file. Permission is asked only after a user action.
- Subscriptions are stored per device. Payloads are encrypted per the Web Push spec.
- A subscription is removed when the push service returns 404 or 410.
- Tibo's proactive messages and relays become push notifications when the user isn't connected.
