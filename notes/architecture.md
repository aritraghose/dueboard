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
| What | Tasks, habits, goals, notes, sessions, tags, settings, connections, activity, relays, usage | Tibo's single thread, memory, summaries, schedules, live connections |
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
                      ├─ TiboAgent DO (one per user) ──────────┘ internal service  │
                      │   SQLite: thread, memory, summaries      binding, acts AS  │
                      │   alarms: proactive check-ins            the DO's user     │
                      ├─ AskAgent (public Q&A, walled off) ── reads ONLY the owner's
                      │                                        ask settings ──────┘
                      └─ ⇄ other users' TiboAgent DOs (relays)
                     Cron sweep Worker: auto-completes expired focus sessions
                     AI Gateway (BYOK Meta key) ◀── every model call
                     Vectorize: Tibo memory embeddings (namespace = user id)
```

### Workers (all created by Alchemy, none public except the Website)

| Worker | Stack | Role |
|---|---|---|
| **Website** | `DueboardWeb` (`web/`) | TanStack Start UI. Proxies `/rpc`, `/api/auth/*` and `/agents/*` to private Workers. |
| **ApiWorker** | `DueboardApi` (`api/`) | Effect RPC API + Better Auth. Hosts the domain services. `workersDev: false`. |
| **AgentWorker** | `DueboardApi` | Hosts `TiboAgent` and `AskAgent` Durable Objects. `workersDev: false`. |
| **Session sweep** (cron) | `DueboardApi` | Runs every minute to complete focus sessions whose time ran out. It can be a `scheduled` handler on the ApiWorker if Alchemy supports it there. |

### Existing conventions to keep

- `api/src/rpc.ts` is the RPC contract shared by api and web, `api/src/api.ts` has the handlers, `api/src/schema.ts` the Drizzle tables, and `web/src/rpc-client.ts` the AtomRpc client.
- Every RPC runs as `CurrentUser` through the `Authentication` middleware, which also applies the per-user `RPC_RATE_LIMIT`.
- Better Auth owns its tables. Reference `user.id` as a plain `text` column with no foreign key (Drizzle migrations run before Better Auth's).
- Web reads bindings through `web/src/env.ts`.
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
   ApiWorker. It exposes a Worker RPC entrypoint that accepts `actorUserId`. It
   is bound only to AgentWorker, never proxied by the Website, so a browser
   cannot reach it. The `TiboAgent` passes `this.name` (its own user id), so
   Tibo can only ever act as its own user.

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
| `focus_sessions` | `id`, `user_id`, `label?`, `planned_minutes`, `status` (`running`\|`paused`\|`completed`\|`stopped`), `started_at`, `ends_at?`, `ended_at?`, `privacy`, `share_to_live` | **Partial unique index on `user_id` WHERE status IN ('running','paused')**, so the database enforces one active session. `ends_at` is recomputed on resume and extend so the sweep can find expired ones. |
| `focus_session_segments` | `session_id`, `started_at`, `ended_at?` | Pause and resume history. Elapsed time is the sum of the segments. |
| `activity` | `id`, `user_id` (actor), `kind`, `subject_type`, `subject_id`, `occurred_at`, `local_date`, `meta jsonb` | The single feed behind Live, diary and contribution graph (§5). Indexes on `(user_id, occurred_at desc)` and `(user_id, local_date)`. |
| `connection_requests` | `id`, `from_user_id`, `to_user_id`, `status` (`pending`\|`accepted`\|`declined`\|`cancelled`), `created_at` | |
| `connections` | `user_low`, `user_high` (ordered pair), `created_at` | Mutual. Removing a connection deletes the row. |
| `blocks` | `blocker_id`, `blocked_id` | Hides everything both ways and blocks requests, relays and the Ask page. |
| `ai_usage` | `user_id`, `period` (`YYYY-MM` in the user's time zone), `units` | Quota ledger (§8). |
| `ai_usage_events` | `user_id`, `units`, `reason`, `ref?`, `created_at` | Audit log. |
| `relays` | `id`, `from_user_id`, `to_user_id`, `message`, `status` (`pending`\|`delivered`\|`answered`\|`declined`\|`expired`), `answer?`, `created_at`, `answered_at?` | §7.5 |
| `ask_settings` | `user_id` PK, `enabled` (default **false**), `instructions`, `shared_context`, `monthly_answer_cap` | §7.6 |
| `ask_usage` | `user_id`, `period`, `answers` | |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at` | Built last. |

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

## 5. Activity, privacy and visibility

### Activity kinds

These are written by the domain services in the same transaction as the change:

| kind | When | Reversed when |
|---|---|---|
| `task_settled` | status → settled | un-settled or deleted → row deleted |
| `habit_completed` | a check-in makes the period (or day) target reached. `meta` holds `periodStart`/`periodEnd`; `local_date` is the check-in's day. | an undo drops it below target → row deleted |
| `goal_progressed` | progress changes (manual or linked). At most one row per goal and local day, updated in place; `meta` holds `valueBefore`, `valueAfter`, `percent`. | the day's changes cancel out → row deleted |
| `goal_completed` | reaches 100% or the target count | reopened → row deleted |
| `session_started` / `session_completed` / `session_stopped` | lifecycle | session deleted → rows deleted |
| `note_created` | a note is written | note deleted → row deleted |

Deleting any item deletes its activity rows. **Activity rows never copy titles,
privacy or share flags.** Those are read from the item when the feed is
displayed, so a privacy change applies everywhere immediately.

### Visibility rules

These live in one module, `api/src/domain/visibility.ts`, and every reader
must go through it:

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
  option   "only mine" → actors = {viewer}

diary (/diary for yourself, /@username for others):
  rows where canSeeItem(viewer, owner, privacy), whatever share_to_live is

contribution graph:
  counts per local_date of task_settled, habit_completed, goal_completed and
  session_completed, INCLUDING private items (counts only, no details).
  session_stopped does not count.
```

Strangers never see Live. They only see public diary items and the graph
on a profile.

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
| `/settings` | `_app` | Defaults, relay policy, Ask page, time zone (read-only display), connections |
| `/@username` | public-readable | Profile card, contribution graph, diary filtered for the viewer. Logged-out visitors can view it. |
| `/@username/ask` | public-readable | Q&A with the user's Ask agent, only if they enabled it |

- The **Tibo button** sits at the top right of every `_app` page and opens a side panel with the same thread as `/inbox`.
- Usernames **cannot be changed**, so `/@username` links never break.
- TanStack Router supports a literal prefix before a param (`@{$username}`). Confirm the exact file-name syntax when building it.

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
  Gateway with BYOK. Use the Responses-format setup already in `api/src/agent.ts`
  (`@ai-sdk/openai` `.responses()` + `env.AI.run` with
  `openaiEndpoint: "/v1/responses"` + the `cf-aig-no-wholesale` header). The
  Agents SDK's `createAI` cannot read this model's replies.

### 7.2 Thread storage (DO SQLite)

- `messages`: `id`, `role` (`user`\|`tibo`\|`system_event`), `body`, `created_at`, `turn_id`, `meta`.
  - A Tibo turn can produce several **bubbles**, each stored as its own row.
  - `system_event` rows hold relays and proactive triggers, which are shown in the thread.
- `messages_fts`: an FTS5 index over `body`, for keyword search over the archive.
- `summaries`: `level` (`day`\|`week`\|`month`\|`year`), `period_start`, `text`, `through_message_id`.
- `memories`: `id`, `text`, `kind` (`fact`\|`preference`\|`person`\|`event`\|`plan`), `created_at`, `superseded_by?`, `source_message_ids`.
- Every message is kept forever. Nothing is truncated.

### 7.3 Building context for each turn

Context is assembled from scratch on every turn and never includes the whole history:

1. **Persona and rules**: the system prompt (§7.7).
2. **Today snapshot**: today's tasks, due habits and progress, active goals, the running session, the time and date in the user's time zone. Fetched from domain services.
3. **Story so far**: the latest year, month, week and day summaries, compact.
4. **Relevant memories**: the top memories by meaning (Vectorize, namespace = user id) and keyword (FTS) for the incoming message. Superseded memories are excluded.
5. **Recent window**: the last ~40 messages, verbatim.
6. **Tools** (§7.4), including `search_conversation(query, from?, to?)` for exact old messages ("what did I say in 2025…").

Background jobs, run on DO alarms after a turn and never blocking the reply:
- **Summarize**: roll messages into day summaries, days into weeks, weeks into months.
- **Extract memories**: pull lasting facts from new messages, embed them (Workers AI embedding model, decided in prompt 18), dedupe, and mark old memories as superseded when a fact changes.

### 7.4 Tools

Tools call the domain services through the internal binding, **as the DO's
user**: list, create, update and settle tasks; check, uncheck, pause and resume
habits; create goals, update progress and link items; create notes; start,
pause, resume, extend and stop sessions; list and create tags; read the
Live and diary; search the conversation; relay (§7.5).

- Destructive or surprising actions (delete, stop a running session, a bulk
  change) must ask the user to confirm first.
- Muse Spark's tool calling must be verified before the tool layer is built.

### 7.5 Relays (Tibo ⇄ Tibo)

Relays work like mail, not like a free conversation between agents:

1. A's Tibo calls `relay(toUsername, message)`.
2. The server checks:
   - B's `relay_policy`: `connections` (the default), `anyone` or `none`;
   - blocks;
   - A's daily relay limit.

   It then inserts a `relays` row and calls B's `TiboAgent`, which adds a `system_event`.
3. B's Tibo tells B: "A is asking …, what should I tell them?"
4. B answers. B's Tibo calls `reply_relay(relayId, answer)`, which delivers to A's DO, and A's Tibo tells A.

**Security:**
- Relay text is **untrusted data** for B's agent, never instructions.
- B's agent cannot run tools because of a relay.
- B's agent can only send back what B explicitly approved.

**Quota:** every model turn caused by a relay costs **half a message to each
user** (§8).

### 7.6 Ask agent (`/@username/ask`)

- A **separate** `AskAgent`, never `TiboAgent` with a stricter prompt.
- It receives only two things: the owner's `instructions` and `shared_context`.
  It has no thread, no memories, no tools and no domain access, because none are
  wired to it.
- Off by default. The owner enables it and sets `monthly_answer_cap`.
- Visitors can be logged out. Limits apply per visitor (by user id if signed
  in, otherwise by IP) through the Rate Limiting binding, plus **Turnstile** on
  the first question.
- Every answer counts against the owner's AI quota and their monthly cap.
- If either runs out, the page shows "unavailable right now".
- The visitor's exchange is short-lived: it lives in a DO per visitor and owner, expires after inactivity, and is not stored in the owner's thread.

### 7.7 Persona

- Tibo is quirky, overconfident, funny and a little unhinged: a chaotic best friend who still gets things done.
- **No swearing.** It is not based on any existing character, so no catchphrases or references.
- It drops the act and is direct and kind if the user seems to be in real distress.
- It replies in short, chat-like bubbles, through a `send_message` tool called once per bubble or a delimiter that the server splits.
- The UI shows a typing indicator while Tibo works and between bubbles, with delays based on bubble length.

### 7.8 Proactivity

- `TiboAgent` uses Agents SDK scheduling (DO alarms) for:
  - a morning plan;
  - deadline nudges (for example, 2 hours before);
  - an evening habit check;
  - session-ended messages.
- Domain changes can wake it through the internal binding.
- A **small daily cap** on Tibo-initiated messages (config) keeps proactivity from using up the monthly quota.
- Delivery is in-app until web push exists (built last).

## 8. AI usage quota

- Every **AI message** counts against one shared monthly quota per user:
  - a Tibo reply turn,
  - a proactive message,
  - a relay turn,
  - an Ask-page answer.
- One reply turn counts as one message, however many bubbles it has.
- Internal background jobs (summaries, memory extraction) do not count, but they have their own internal budget.
- The ledger stores **units**: 1 message = 2 units, so a relay turn costs 1 unit (half a message) to each user.
- The limit is `AI_MONTHLY_MESSAGE_QUOTA` (config, default **300**), overridable per user (`user_settings.ai_quota_override`). Changing it never needs a code change.
- The check happens **before** a model call. Usage is recorded after it succeeds.
- **At the limit**:
  - the composer disappears;
  - a notice styled like a Tibo bubble says the limit is reached and more usage is coming soon;
  - the notice is built **in the UI only**: never stored in the thread, memory or database.
- Pricing will come after product-market fit. Keep the ledger shaped so plans and per-plan quotas can be added later.

## 9. Rate limiting and abuse protection

These are Cloudflare Rate Limiting bindings. Each `namespaceId` must be unique in the account.

| Namespace | Key | Limit | Where |
|---|---|---|---|
| 1003 `AUTH_RATE_LIMIT` | IP | 30/min | `/api/auth/*` (exists) |
| 1004 `RPC_RATE_LIMIT` | user | 120/min | every RPC (exists) |
| 1005 `CHAT_RATE_LIMIT` | user | 10/min | Tibo turns (exists, reused) |
| 1006 | user | strict (e.g. 20/day) | connection requests |
| 1007 | user | strict (e.g. 30/day) | relays sent |
| 1008 | IP | moderate | public profile pages (`/@username`), logged out |
| 1009 | visitor (user or IP) | strict | Ask page questions, plus Turnstile |
| 1010 | IP | moderate | `/agents/*` WebSocket upgrades |

- All limits live in one place (`api/src/limits.ts` or similar), so they're easy to tune.
- Request bodies get size limits through Schema `maxLength` everywhere.

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
  whose `ends_at <= now()`, writes `session_completed` and (later) notifies
  Tibo. Reads also complete them lazily, so the UI is right even between sweeps.

## 12. Web push (last)

- VAPID keys are stored as Alchemy secrets.
- The service worker is a local file. Permission is asked only after a user action.
- Subscriptions are stored per device. Payloads are encrypted per the Web Push spec.
- A subscription is removed when the push service returns 404 or 410.
- Tibo's proactive messages and relays become push notifications when the user isn't connected.
