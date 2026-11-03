# Dueboard planning

What Dueboard is, every product decision made so far, the rules for building,
and the build order. How it's built is in [architecture.md](architecture.md).

## Vision

Dueboard is a productivity app with an AI agent, **Tibo**, that helps manage
the user's life to make them as productive as possible: an operating system for
the user's life. Pricing comes after product-market fit. Build so that plans
and quotas can be added later without redesigning anything.

## Product spec

### `/now`

- The **top center** shows the selected date and day ("Sun, Nov 1"), with the local time under it. ← and → move to the previous and next day and show the same data for that date.
- Sections for the selected day:
  - **Tasks**, with a **Settled** list.
  - **Unscheduled** tasks (no dates).
  - **Habits** checklist. When all are done it shows "All habits checked", and the checked habits sit in Settled.
  - **Goals**, showing each active goal's progress (%).
  - **Focus session** widget.
  - **Live**: can be minimized, with a "only mine" toggle.
- An **Upcoming** button shows tasks, habits and goals for coming dates, grouped by date.

### Tasks

- **Fields**:
  - title
  - description (optional)
  - assigned date (optional)
  - deadline date (optional)
  - tag (defaults to the user's `default` tag)
  - status: `idle` (default), `working` (a label only), or `settled`
  - privacy
  - shareToLive
  - importance, 1–5 stars (optional)
  - expected duration in minutes (optional)
- **Display**:
  - Unset optional fields are **hidden** in lists so the UI stays minimal.
  - Clicking a task opens a **task card** showing every field, including the unset ones.
- **Which days it appears on**:
  - It appears on its assigned date, on its deadline date, or on both if they differ.
  - On the deadline date, a task settled earlier shows in **Settled**.
  - The assigned date can't be after the deadline date.
  - Overdue tasks are **not** carried forward.
  - Tasks with no dates show under **Unscheduled** on `/now` and on `/tasks`.

### Habits

- **Fields**:
  - title
  - description (optional)
  - schedule
  - privacy
  - shareToLive
- **Schedule types**:
  - **Flexible**: N times per period, such as 3× per week, 2× every 5 days, 10× per month, or every 2 weeks. It shows every day of the period until done.
  - **Specific days**: weekdays (Mon/Wed/Fri) or month days (1st and 15th), with N taps needed on each of those days.
  - **Daily with a count**: for example, 5 LeetCode problems a day means 5 taps.
- **Behavior**:
  - Each tap adds 1, and a tap can be undone.
  - Habits can be paused and resumed.
  - Habits show with the `habit` tag in task lists.
  - Streaks are tracked.

### Goals

- **Fields**:
  - name
  - description
  - progress, either a completion slider (%) or a **target count** (7/20 → 35%)
  - optional target date
  - privacy
  - shareToLive
- **Behavior**:
  - A goal shows **every day until completed**.
  - Goals can be paused and resumed. Progress can go down, and a completed goal can be reopened.
  - **Linked items**: habits and tasks can be linked to a goal with an amount. Each check-in or settled task adds that amount.
  - Example: the goal "Solve 250 LeetCode problems" with the habit "5 problems a day" linked at +1 per tap.

### Notes

- At most 60 characters each, with several allowed per day.
- Each has privacy and shareToLive.

### Focus sessions

- **Fields**:
  - duration in minutes
  - optional label
  - privacy
  - shareToLive
- **Behavior**:
  - Sessions can be paused, resumed and extended.
  - **Only one** can be running or paused at a time. Starting another shows a warning, and confirming **stops** the old one.
  - When the time runs out, a session auto-completes even if the app is closed.
  - A session stopped early has status **stopped**. It does not count on the contribution graph.
- **Live**: with shareToLive on, the session's start and its completion (or stop) appear on Live.

### Tags

- Users create tags, each with a color.
- The pre-created tags `default`, `habit` and `goal` can be recolored but not renamed or deleted.

### Privacy and Live

- Every event type has `privacy` (`public` | `connections` | `private`) and `shareToLive` (yes/no).
- **Defaults**: privacy `connections`, shareToLive yes. Each user can change these defaults in settings.
- **Live**: shows the user's and their connections' events, with timestamps, and never strangers'.

  | privacy | shareToLive | Live shows | Diary visible to |
  |---|---|---|---|
  | public | yes | "ar1tra settled a task: add rate limiter" | everyone |
  | connections | yes | full text | connections |
  | private | yes | "ar1tra settled a task" | only the user |
  | public | no | — | everyone |
  | connections | no | — | connections |
  | private | no | — | only the user |

- Live can be **minimized**, and it has an **only mine** toggle.

### Diary

- Each user has one diary: tasks, checked habits, completed goals, notes and sessions, grouped by day.
- `/diary` shows the user's own diary.
- A user's profile shows their diary, filtered to what the viewer is allowed to see.

### Profile (`/@username`)

- Shows the profile card (with the connections count on its own row; the user's points will sit at its right once scoring exists), then tabs: **Overview** (default: the counts and a GitHub-style **contribution graph**), Tasks, Habits, Goals, Diary and Sessions, each filtered to what the viewer may see.
- **Points**: +1 for each settled task and completed focus session, and for each habit checked or goal moved on a day. Shown on the profile and on `/leaderboard` (connections or everyone; all time, this month, this week, today).
- The item tabs show **completed** items only (settled tasks, met habit goals, completed goals, completed sessions); the Diary is all of those plus notes.
- The graph counts settled tasks, completed habits, completed goals and completed sessions. Private items are counted, but no details are shown.
- Logged-out visitors can view the public parts.
- Usernames **cannot be changed**.

### Connections

- Users send connection requests, which can be accepted or declined.
- A connection can be removed.
- Users can **block** someone, which hides everything between them and stops requests, relays and the Ask page.

### Pages

- `/now`, `/inbox`, `/boards`, `/tasks`, `/habits`, `/goals`, `/notes`, `/live`, `/sessions`, `/diary`, `/tags`, `/discover`, `/connections`, `/leaderboard` and `/settings`.
- `/boards` shows every board (Tasks, Habits, Goals, Notes, Live, Diary) as a card that opens it, then Profile, Leaderboard, Discover and Settings.
- `/live` is Live on its own page: the feed of what the user and their connections get done.
- `/glance` is retired; sign-in lands on `/now`.

### Tibo (the AI agent)

- Knows and can do everything the user can, on their behalf.
- **One conversation thread forever**, like a messaging app. It must remember things from a minute ago and from years ago, and know all past, present and future events.
- Feels **human**:
  - a typing indicator;
  - replies in several short bubbles;
  - the tone of a funny, quirky, slightly unhinged friend, with **no swearing** and not based on any existing character;
  - it drops the act if the user seems to be in real distress.
- Opened from the **Tibo button** at the top right of every page (as a side panel), or at `/inbox`. Both show the same thread.
- **Proactive**: morning plans, deadline nudges, habit check-ins and session-end messages, with a small daily cap.
- **Relays**:
  - Any user's Tibo can relay a message to another user through that user's Tibo.
  - Each user's relay policy decides who can relay to them: connections (default), anyone or none.
  - Each relay turn's cost is split 50/50 between the two users.
- **Ask page** (`/@username/ask`):
  - **Off by default.** The owner turns it on and writes instructions and the context to share.
  - The Ask agent answers **only** from those, and is walled off from the owner's private data.
  - The owner sets a monthly answer cap.
  - Visitors (logged in or not) have their own limits.
- **Model**: Meta Muse Spark 1.3 only, through AI Gateway with BYOK (free Meta credits).

### AI usage quota

- Each user gets **300 AI messages per month**. That covers Tibo replies, proactive messages, relays (half each) and Ask answers, all counted together. This is a config value that can be changed easily, with optional per-user overrides.
- **At the limit**: the composer disappears, and a Tibo-style notice says the limit is reached and more usage is coming soon. The notice exists only in the UI: it isn't stored anywhere.

### Platform

- **Web only** for now; a native app comes later.
- Rate limits across the app protect it from bad actors.
- Web push notifications are the **last** task.

### Later (not in this plan)

- Gmail, Calendar and other integrations.
- Tibo's own 24/7 VM.
- Payments and pricing plans.
- A native app.

## Working rules for every build thread

These come from `AGENTS.md`, the project memory and this planning. Every prompt
repeats the critical ones.

1. Read `AGENTS.md`, this file and `architecture.md` first.
2. **Ask before installing any dependency.** List the exact package and version for approval.
   - Add packages with `bun add <pkg> --catalog`, run from `api/` or `web/`.
   - The project blocks packages released within the last 2 days (`minimum-release-age`), so pick a version older than that.
3. **Confirm before every deploy**, one at a time. Never tell the user to export `CLOUDFLARE_*` variables.
4. **UI work**:
   - Load the `frontend-design` skill.
   - Follow the centralized styles in `web/src/styles.css`, and update it rather than scattering styles.
   - Use shadcn components.
   - No external assets, fonts, CDNs or links.
5. **Low-RAM machine (~7 GiB)**: never run `tsc -b` or a full build while `alchemy dev` servers are running. Stop them first.
6. **Dev**: `bun run dev:api` first, then `cd web && bun run dev` (skip `tsc -b` if it already passed). Prefer running dev servers in terminal tabs the user can see.
7. **Database changes**:
   - Edit `api/src/schema.ts`. Migrations are generated into `api/migrations/` on `alchemy dev` or deploy. Commit them.
   - Reference Better Auth's `user.id` as plain `text`, with no foreign key.
8. All business rules go in domain services (`api/src/domain/`), never in RPC handlers or UI. Pure rules get `bun test` unit tests.
9. Every reader of other users' data goes through `api/src/domain/visibility.ts` (once it exists).
10. Every new rate limit gets a unique `namespaceId`, registered in architecture.md §9.
11. **Finishing a thread**:
    - Run the typecheck (with dev servers stopped).
    - Update the **Status** checklist below and note any decision changes in this file.
    - **Ask before committing or pushing.**

## Build order

Each step is one fresh thread, started with `notes/prompts/promptN.md`. They
are sequential: each assumes the previous ones are done.

| # | Step | Builds on |
|---|---|---|
| 1 | Domain foundation: settings, tags, time zones, activity table, service layer pattern, `/glance` → `/now` | — |
| 2 | App shell and design system: layout, navigation, Tibo button placeholder, `/now` skeleton with the date navigator | 1 |
| 3 | Tasks: backend (schema, services, RPCs) | 1 |
| 4 | Tasks: UI on `/now` (today, settled, unscheduled), task card, `/tasks` | 2, 3 |
| 5 | Habits: rule engine and backend | 1 |
| 6 | Habits: UI on `/now`, `/habits` | 2, 5 |
| 7 | Goals: backend, including goal links from habits and tasks | 3, 5 |
| 8 | Goals: UI on `/now`, `/goals`, linking UI | 6, 7 |
| 9 | Notes: backend and UI, `/notes` | 2 |
| 10 | Focus sessions: backend and cron sweep | 1 |
| 11 | Focus sessions: UI widget on `/now`, `/sessions` | 2, 10 |
| 12 | Upcoming view and day navigation polish across all types | 4, 6, 8, 9, 11 |
| 13 | Profiles, connections, blocks, `/settings` | 1 |
| 14 | Visibility module and Live on `/now` | 12, 13 |
| 15 | Diary (`/diary`, profile diary) and contribution graph | 14 |
| 16 | Rate limiting pass and AI usage quota ledger | 13 |
| 17 | Tibo core: `TiboAgent`, single thread, bubbles, typing, persona, quota notice, side panel and `/inbox` | 16 |
| 18 | Tibo tools: the internal service binding and domain tools | 17 |
| 19 | Tibo memory: summaries, memories, Vectorize, conversation search | 18 |
| 20 | Tibo proactivity: schedules, daily cap, domain triggers | 19 |
| 21 | Tibo relays | 20 |
| 22 | Ask page: `AskAgent`, settings, Turnstile, caps | 16, 17 |
| 23 | Web push notifications | 20, 21 |
| 24 | Hardening: security review, staging deploy, launch checklist | all |

## Status

- [x] 1 Domain foundation
- [x] 2 App shell and design system
- [x] 3 Tasks backend
- [x] 4 Tasks UI
- [x] 5 Habits backend
- [x] 6 Habits UI
- [x] 7 Goals backend
- [x] 8 Goals UI
- [x] 9 Notes
- [x] 10 Sessions backend
- [x] 11 Sessions UI
- [x] 12 Upcoming and day navigation
- [x] 13 Profiles and connections
- [x] 14 Visibility and Live
- [ ] 15 Diary and contribution graph
- [ ] 16 Rate limits and AI quota
- [ ] 17 Tibo core
- [ ] 18 Tibo tools
- [ ] 19 Tibo memory
- [ ] 20 Tibo proactivity
- [ ] 21 Tibo relays
- [ ] 22 Ask page
- [ ] 23 Web push
- [ ] 24 Hardening

## Decision log

Add a dated line whenever a decision changes during a build thread.

- 2026-11-01: The agent is named **Tibo** everywhere; the earlier working name was Wolowitz.
- 2026-11-01: Profiles live at `/@username`, so no reserved-username list is needed.
- 2026-11-01: Relay turns are split 50/50 between the two users' quotas.
- 2026-11-01 (step 1): Ids are `crypto.randomUUID()` (UUIDv4) in `text` columns, made by `newId()` in `api/src/domain/database.ts`. No dependency; lists order by timestamps, not ids.
- 2026-11-01 (step 1): Tag colors are keys of a fixed 10-color palette (`TAG_COLOR` in `api/src/domain/model.ts`: gray, red, orange, amber, green, teal, blue, indigo, violet, pink), stored as `text`. Step 2 maps each key to light and dark shades in `web/src/styles.css`. System tags: `default` gray, `habit` green, `goal` violet.
- 2026-11-01 (step 1): Domain services read the Drizzle db from the `Database` Effect service and take the acting user id as their first argument. Shared values, inputs and typed errors live in `api/src/domain/model.ts` (no database code) and are re-exported by `rpc.ts` for the browser.
- 2026-11-01 (step 1): The settings row and system tags are created lazily by the `Bootstrap` RPC, which the `_app` layout runs on every load, not in onboarding. This backfills older accounts and keeps the time zone in sync. An invalid browser zone is ignored (new rows fall back to UTC). The time zone isn't user-editable.
- 2026-11-01 (step 1): Tag writes lock the user's settings row (`SELECT … FOR UPDATE`) so concurrent creates can't pass the 50-tag limit. A partial unique index keeps one tag per system kind.
- 2026-11-01 (step 1): RPCs are named in PascalCase (`Bootstrap`, `ListTags`, …).
- 2026-11-02 (step 1): Each user gets a random color (`USER_COLOR`: the tag palette minus gray) when their settings row is created, so the timeline can show usernames in it. It's stored in `user_settings.color`, returned in `Settings`, and not user-editable yet. Rows that existed before the column were backfilled by a random SQL default.
- 2026-11-02 (step 2): **Design tokens** live in `web/src/styles.css`. Geist is the only font (the user declined font dependencies).
  - **Light mode**: the page is a cream-to-teal gradient (`--page-gradient`, top to bottom). Every `bg-card`/`bg-popover` surface gets `--card-gradient` (a base-layer rule). Ink and actions are deep teal (`--primary`). Marigold (`--tibo*`) is reserved for Tibo and the "today" dot. The nav is a light teal (`--sidebar`).
  - **Dark mode**: neutral black, after T3 Code. Page and cards share one `#0c0c0c`→`#060606` wash; cards stand out by a border plus `--card-shadow`. Text is `#f5f5f5`, quiet text `#a1a1a1`, the nav matte `#121212`.
  - **Other tokens**: `--success` (done states), `--cream` ("Start a session"; gray in dark), `--card-glow` (the glow under `/now`'s cards), `--bubble-me` (your chat bubble), `--composer-border` (the light-mode message box edge).
  - **Tag colors**: `--tag-<key>`, `--tag-<key>-soft` and `--tag-<key>-ink`. Set `data-tag="<key>"` and use `bg-tag`, `bg-tag-soft` and `text-tag-ink` (`TagChip`). User colors use the same keys.
  - **Rules**: a global reduced-motion rule; card titles sit in the top middle with side controls in the corners.
  - **Gotcha**: the `cn` package doesn't merge conflicting Tailwind classes, so overriding a shadcn default needs `!` (for example `bg-cream!`).
- 2026-11-02 (step 2): **Navigation.** The shared list is `web/src/lib/nav.ts`.
  - **Desktop**: a full-height sidebar (shadcn `sidebar-07`, `components/app-sidebar.tsx`) that collapses to an icon rail. Its state is in the `sidebar_state` cookie, read on the server through `lib/sidebar-state.ts`.
  - **Desktop items**: Now, Inbox, Boards, then Settings and the avatar menu (profile `/@username`, theme, sign out). Under Boards, a subsection (Tasks, Habits, Goals, Notes, Live, Diary) shows only while expanded.
  - **Phones** (< 768px): a floating tab bar (`components/mobile-nav.tsx`) with Now, Inbox, Boards and Profile. Profile is the user menu and also holds Settings. Swiping up on the bar, or tapping its handle, opens Tibo.
  - `/sessions` exists but isn't linked anywhere yet.
- 2026-11-02 (step 2): **Top row and Tibo.**
  - **Top row** (`components/top-bar.tsx`): a page fills its start and center slots through its route's `staticData.topBar: { start, center, tibo }`; Tibo holds the end on desktop. On phones Tibo is a draggable floating button above the nav instead (`TiboFab`, position in localStorage `dueboard-tibo-fab`). `tibo: false` hides both (as on `/inbox`); a row with nothing in it isn't drawn.
  - **Tibo panel**: one Sheet owned by `TiboProvider` (state in `hooks/use-tibo.ts`). On desktop it grows out of the Tibo button (`[data-tibo-panel]` animation in `styles.css`); on phones it rises from the bottom. It and `/inbox` host the demo `AgentChat` until step 17 ("Tibo" is UI naming only). Your messages sit in a bubble; Tibo's replies are plain text.
- 2026-11-02 (step 2): **Layout.**
  - **Margins**: the `_app` margins are thin (6px; phones keep 6rem at the bottom for the nav), so cards reach the screen edges. `Page` (list pages) pads its own content.
  - **Full-screen pages**: `/now` and `/inbox` are exactly one screen tall through `h-[calc(100dvh-…)]` values that assume a 3rem top row and those bottom paddings. Keep them in sync if either changes.
  - **Pages**: `/boards` shows each board as a square card (at most 13rem), centered, in rows of 2, 3 (`sm`) or 6 (`xl`). `/live` is a full-page `LiveCard`. List pages show full-space empty states. `/settings` shows the time zone and tags.
- 2026-11-02 (step 2): **`/now`.**
  - **Selected day**: `?date=YYYY-MM-DD`, validated with `LocalDate`; absent means today in the user's zone. Stepping onto today drops the param, and day steps use `replace`. ← and → step days (`hooks/use-day-arrow-keys.ts`) except in fields, menus, dialogs and tablists.
  - **Top row**: "Start a session" ("Start" on phones; a placeholder toast for now; a running session's countdown replaces it in step 11). Today's date and the ticking local time sit in the center.
  - **Two cards** (`isolate` on the container keeps both `--card-glow` glows under both cards):
    - **Day card** (two thirds): the `DayStepper` heading centered ("Today", "Yesterday", "Tomorrow" or the date, between ‹ and ›). Then the tasks area, which takes the rest of the height and scrolls inside itself. At the bottom are two `DayTabs` rows, each with its own fold chevron: tabs only switch, the chevron alone folds, and both start folded. The rows are Settled / Sessions / Unscheduled (with counts), and habits and goals, whose tab titles are the statuses ("No habits due", later "All habits checked" in `--success`).
    - **Live card** (one third): `components/live-card.tsx`, with a 60-character `NoteComposer` that step 9 wires up. It collapses on desktop (localStorage `dueboard-live-collapsed`), giving the day card the full width.
  - **Phones**: the two cards become Tasks and Live tabs.
  - **Upcoming**: there's no Upcoming button any more. Step 12 needs to agree a new entry point with the user. (Step 12: a button in the day card's top-right corner, and U.)
- 2026-11-02 (step 2): **The timeline is now called Live**, everywhere: UI, code, notes and data.
  - `share_to_timeline` became `share_to_live` (`shareToLive`). Later tables use `share_to_live`.
  - `user_settings.default_share_to_timeline` was renamed by the hand-written migration `api/migrations/20261101220000_share_to_live` (`RENAME COLUMN` plus an updated `snapshot.json`). Alchemy runs drizzle-kit non-interactively, and it can't choose rename versus drop-and-create, so **write rename migrations by hand** the same way.
- 2026-11-02 (step 2): **Plumbing and gotchas.**
  - **Session reuse**: the `_app` guard reuses the session checked on entry when `cause === "stay"` (`lib/session-cache.ts`), so moves inside the app don't wait on `get-session`.
  - **Settings and tags**: Bootstrap is the client's source for both, through `useBootstrap()` and `useTimeZone()` (`hooks/use-bootstrap.ts`); the browser zone stands in until it answers. Date display helpers are in `lib/dates.ts` (`formatDay` → "Sun, Nov 1", `relativeDay`, `formatClock`); weeks start on Sunday.
  - **`validateSearch`** must always return its keys (even `undefined`), or the router merges invalid raw values back in.
  - **Compiled API types**: the web app imports them from `api/lib`, so after changing `api/src/rpc.ts` or `model.ts`, run `tsc -b` (with dev servers stopped) or the browser fails to decode RPC results.
  - **Fast Refresh**: keep hooks in `hooks/`, not exported beside components, or Fast Refresh breaks.
  - **Pre-existing error**: `tsc -b` still fails on `api/src/agent.ts(41)` (`preconnect`), which predates step 2; typecheck web with `bunx tsc -p web/tsconfig.json --noEmit`.
- 2026-11-02 (step 3): **Tasks backend.** Table `tasks` (migration `20261102121723_migration`), service `api/src/domain/tasks.ts`, pure rules in `tasks-rules.ts` (tested).
  - **Errors**: the prompt's `NotFound` and `ValidationError` follow step 1's names: `TaskNotFound` and the existing `InvalidInput` (dates out of order, bad cursor, inverted range). A tag that isn't the user's is `TagNotFound`. Another user's task is always `TaskNotFound`, never "forbidden".
  - **Database guards**: `CHECK`s for title and description lengths, importance 1–5, minutes 1–1440, assigned ≤ deadline, and `settled_at` set exactly when settled. `tag_id` is a foreign key to `tags` with `ON DELETE RESTRICT`, so a tag can't be deleted with tasks still on it (`deleteTag` moves them to `default` first, in the same transaction).
  - **Titles** must be trimmed, 1–200 characters (like tag names): the client trims. Descriptions are ≤ 2000, untrimmed.
  - **Status**: tasks are created `idle`. `SetTaskStatus` is the only way to change status. Leaving `settled` for `idle` or `working` clears `settled_at` and deletes the `task_settled` row. Writes lock the task row (`FOR UPDATE`).
  - **Goal seams**: `onTaskSettled` / `onTaskUnsettled` in `tasks.ts` (no-ops). Deleting a settled task calls `onTaskUnsettled` first, so step 7 reverses its goal progress there and also deletes the task's `goal_links`.
  - **Unscheduled settled**: `ListUnscheduledTasks({ settledOn })` returns undated tasks settled on that local day, found through their `task_settled` activity's `local_date`.
  - **`ListTasks`**: newest first by `(created_at, id)`, with the cursor `<ISO>|<id>`. `created_at` is set from JS on insert (millisecond precision), so the cursor's `Date` round-trip is exact. `status` is an array filter; `from`/`to` match either date; `query` is a literal case-insensitive title search (`ILIKE`, with wildcards escaped). Default 50, max 100. An extra index `(user_id, created_at desc, id desc)` serves it.
  - **Manual check**: run against a throwaway local Postgres (Docker `postgres:17`) with every migration applied, not through RPC (sign-in is Google-only). It covered settle/unsettle activity, the dates rule, cross-user isolation, the tag reassign and pagination.
- 2026-11-02 (step 4): **Tasks UI.**
  - **Unscheduled shows on every day** in `/now`'s bottom tab row, not only today: undated tasks aren't tied to a day, and seeing them while planning tomorrow is the point. Unscheduled tasks settled on the selected day (`ListUnscheduledTasks({ settledOn })`) join that day's Settled list.
  - **Task card is a centered dialog** (`components/task-card.tsx`, `TaskDialog`) on every screen size, for both creating and editing, at the user's request (the prompt allowed a sheet). Editing saves each field as it changes (unsaved values show at once from a local draft); creating collects the fields and adds with "Add task" or Enter in the title.
  - **No inline quick add.** Creating is a "New task" button (the day card's top-left corner on `/now`, the page header on `/tasks`) or the `N` key, opening the create card. A new task goes on the selected day (`/tasks`: today, or undated from the Unscheduled view); clearing its assigned date (one click on ×) makes it unscheduled.
  - **Tags in the card**: a list of the user's tags, each with an edit button, and "New tag" at the bottom. Creating and editing open a tag card (`components/tag-dialog.tsx`) over the task card; it can also delete a user tag (its tasks move to `default`). System tags only change color. A new tag is picked on creation. `/settings` now reads tags from `ListTags` so edits show there.
  - **Dates** use the shadcn `Calendar` (`react-day-picker` 10.0.2, `date-fns` 4.4.0, approved by the user, added through the catalog). Days on the wrong side of the other date are disabled, so assigned ≤ deadline holds in the picker; the API still checks it.
  - **Rows** show only set fields (tag hidden when it's `default`, stars, minutes, a deadline badge, a `Working` label). Settling checks and strikes the row for 320 ms, then it moves to Settled (shared `layoutId`s, `motion`) and the Settled count pops.
  - **Data**: task queries carry the `tasks` reactivity key, tags `tags`. Writes go through `useTaskActions()` (`hooks/use-tasks.ts`), which runs each call as its own short-lived atom: the shared `ApiClient.mutation` atom interrupts an earlier in-flight call when called again. A settle/reopen click overrides the row's status until its call has answered and the refetched list agrees, so a stale refetch can't flip it back.
  - **`/tasks`**: `?view=upcoming|unscheduled|settled` (absent = All), `?tag=`, `?q=` (debounced title search), "Load more" by cursor (30 per page). `ListTasks` has no "no dates" filter, so Unscheduled uses `ListUnscheduledTasks` and filters tag and search in the browser. Upcoming groups by each task's next date ≥ today, Settled by the day it was settled; since `ListTasks` is newest-created first, "Load more" can add tasks to groups already shown.
  - **Tokens**: `--importance` (stars) and `--due` / `--due-foreground` ("Due today") come from the tag palette, keeping marigold for Tibo. `.dark` sets `color-scheme: dark` for native controls.
  - **Deleting** hides the row at once (`removedTasksAtom` in `hooks/use-tasks.ts`); it comes back only if the delete fails. "Try again" on a failed list invalidates the `tasks` and `tags` keys: refreshing `taskListAtom` alone would reuse its failed page atoms.
  - **Gotcha**: a dialog inside a `<form>` (the tag card inside the task card) renders in a portal, but React still bubbles its `submit` through the component tree to the outer form. Inner forms call `event.stopPropagation()` in `onSubmit`.
  - **Gotcha**: the dev DB answers in seconds per call and sometimes times out (`PgConnection: Connection timed out`), so test with that in mind; the UI shows changes before the server answers.
- 2026-11-02 (step 4, follow-up): **View options, stars, top bar.**
  - **View row** (`components/view-controls.tsx`, `hooks/use-view-options.ts`) above the list on `/now` and `/tasks`: Sort (Default order, Importance, Expected time) with one arrow button beside it that flips ascending/descending, and Group. Importance starts most-important-first, expected time shortest-first; tasks without the value sort last either way. Remembered per viewer and page in localStorage (`dueboard-view-now`, `dueboard-view-tasks`).
  - `/now` adds Show (All, Tasks, Habits, Goals) and Group by tag. Habits and Goals show a placeholder until steps 6 and 8; their build steps must hook into this filter. Sorting applies to the open list and the Unscheduled tab; Settled stays most recent first.
  - `/tasks` groups by Day (its old automatic grouping for Upcoming and Settled), Tag, or None.
  - **Importance**: rows show a soft amber pill with one star and the number; the card has a star track with the level in words (Low, Minor, Medium, High, Critical; `IMPORTANCE_LABEL`) and a pop on pick (`--animate-star-pop`). Tokens `--importance-soft` and `--importance-ink`.
  - **New task** on `/now` floats at the bottom right of the task list, just above the tab rows; the list keeps bottom padding so it never covers the last row.
  - **Hideable top row on `/now` only**: `topBar.hideable` in the route's `staticData`, toggled by the button in the day card's top-left corner (`hooks/use-top-bar-hidden.ts`, localStorage `dueboard-now-top-bar-hidden`). Visible by default. Hidden, `/now` takes the full height (its `h-[calc(…)]` values change with it).
- 2026-11-02 (step 5): **Habits backend.** Tables `habits`, `habit_pauses`, `habit_checkins` (migration `20261102155146_habits`), pure engine `api/src/domain/habit-rules.ts` (tested), service `habits.ts`, 11 RPCs.
  - **Migration by hand**: generated with the same `drizzle-kit generate --dialect postgresql --schema ./src/schema.ts --out ./migrations` Alchemy runs (from `api/`, no dev server), then the folder renamed to `_habits`.
  - **Schedule input** is one `schedule` object (`HabitSchedule`: `kind`, `targetCount`, `periodUnit`/`periodLength` for flexible, `weekdays` or `monthDays` for specific days), set and replaced as a whole, so switching kinds never leaves stale columns. Days are deduped and sorted. `specific_days` stores `day` × 1.
  - **Multi-month periods** (the prompt left them open) are blocks of calendar months starting with `start_date`'s month ("every 2 months" from Nov 20 → Nov–Dec, Jan–Feb). 1-week and 1-month periods can be partial in the first period; days before `start_date` are never due and their taps don't count.
  - **Progress is the whole period's total**, not "as of" the day: once a week's target is met, every day of that week (earlier ones too) reads `complete`. Taps on paused days still count toward their period.
  - **Pauses** cover `[start_date, end_date)` in the user's zone: pausing starts today, resuming ends the pause today (so today is due again), and a pause opened and closed the same day is deleted. **Archiving opens a pause too**, so archived days never break the streak, and `ResumeHabit` also restores an archived habit. Pausing an archived habit is `InvalidInput`.
  - **Streak**: walking back from the current period (or scheduled day), a complete one counts (even with paused days), the current one never breaks it, an incomplete one with any paused day is skipped, anything else ends it. Reads load all of a habit's taps (fine at v1 scale).
  - **Check-ins**: `CheckInNotAllowed` with `reason` `future` | `too_old` (> 30 days back) | `not_due` (also for undo) | `not_active` (archived). A paused habit can still be backfilled on days before its pause. Taps past the target are allowed (they'll count toward linked goals). Undo with no taps that day is a no-op. Writes lock the habit row.
  - **`habit_completed`**: one row per period, found by `meta->>'periodStart'`. It's dated on the **check-in's day** (`recordActivity` gained a `localDate` override), so a backfilled completion counts on the contribution graph where it belongs. A rule edit keeps check-ins and old rows; a re-completion of a period that already has a row doesn't add another.
  - **`ListHabitsForDay`** leaves out archived habits and habits not scheduled that day; `allChecked` = nothing due and at least one settled. Each entry (`HabitOnDay`) carries `schedule` text, `status`, `progress` (period, done/target), `countOnDay` and `streak` as of today; check-ins return the same shape.
  - **Goal seam**: `onHabitCheckIn(tx, habit, delta)` in `habits.ts` (no-op). `deleteHabit` has no goal seam yet: step 7 decides whether deleting reverses goal progress and must delete the habit's `goal_links` there.
  - **Browser**: `rpc.ts` re-exports `describeSchedule`, `periodFor`, `progressFor`, `dayStatus`, `isScheduledOn` and `streak`.
  - **Manual check**: like step 3, against a throwaway Docker `postgres:17` with every migration applied, calling the services (38 checks: 5/day, 3×/week all week, pause/resume/archive, activity add/remove, backfill dating, refusals, isolation, the schedule `CHECK`).
- 2026-11-02 (step 6): **Habits UI.** `components/habit-section.tsx` (`/now`), `habit-dialog.tsx` + `schedule-builder.tsx` (create/edit), `habit-ring.tsx`, `routes/_app/habits.tsx`; data in `hooks/use-habits.ts`, wording in `lib/habits.ts`.
  - **Where habits show on `/now`**: Show = Habits lists the due cards, then that day's Settled habits. Show = All lists tasks, then the due cards under a small "Habits" heading. The bottom habits tab's title is the status ("Habits due 2", "No habits due", or "All habits checked" in `--success`), and its content is the day's Settled habits. N and the floating button add a habit in the Habits view and a task otherwise.
  - **Taps**: a whole card is the tap target. A habit's taps go to the API one after another (a per-habit promise queue), so 5 quick taps land as 5 in order. The screen shows the newest answer plus the unanswered taps until the refetched list agrees (`useHabitTaps`). A card that meets its target lingers full for 650 ms, then moves to Settled (shared `layoutId`s). Undo is the arrow on a card or a settled row, or "Undo" in the toast. The toast reuses one id per habit, so quick taps update one toast instead of stacking.
  - **Celebration**: "All habits checked" replaces the cards when nothing is left. Rings burst from the check (`--animate-habit-burst`) only when the user's own tap got there, not on load. `useReducedMotion` and the global reduced-motion rule skip it. Each tap pops the ring (`--animate-ring-pop`).
  - **Ring**: one segment per tap up to 12, a smooth arc above that, in the `habit` tag's color (`data-tag`, from `useHabitColor()`). Track `stroke-tag/20`, since `tag-soft` vanished in dark mode.
  - **Read-only days**: future days show what will be due, and days more than 30 back show a note. Cards there aren't buttons (`checkInWindow` in `lib/habits.ts` mirrors the API's limits).
  - **Hints**: when the target is above 1, the card shows "x of N today / this week / this month", or "by <period end>" for multi-unit periods. "That …" is used when today isn't in the period shown. With a target of 1, it shows the schedule sentence instead.
  - **Form**: one form saved as a whole ("Add habit" / "Save"), unlike the task card's per-field saves, because a schedule's fields depend on each other. Editing sends only the changed keys, and an unchanged schedule isn't sent (a new one replaces the rule). The presets map to `HabitSchedule` in `lib/habits.ts` (`toSchedule` / `draftFor`): a saved rule opens on the preset that fits it, or on Custom. The preview is the API's own `describeSchedule` (already re-exported by `rpc.ts`), so there is no copy of it. The start date can't be cleared (`DateField` gained `required`).
  - **`/habits`**: `?status=paused|archived` (absent = Active), with counts in the tabs. The rows are a divided list, not cards, each with a ring, the schedule sentence, the current period's hint, the streak ("3 weeks in a row") and a 12-week heatmap (CSS grid, a column per week with Sunday on top). Full cells meet the day's share of the target (the target for per-day rules, any tap otherwise), half cells have some taps, faint cells are before the start date, and future cells are blank. Its menu has Edit, Pause/Resume, Archive/Restore, and Delete behind an AlertDialog.
  - **Shared code**: `useRun()` (one short-lived atom per call) moved out of `useTaskActions` in `hooks/use-tasks.ts` so habit writes use it too. `PRIVACY_LABEL`/`PRIVACY_HINT` moved to `lib/privacy.ts`.
  - **Gotcha**: `api/lib` was stale (built before step 5), so the browser couldn't decode habit RPCs. It was rebuilt with `tsc -b` (dev servers stopped). It still fails only on the old `agent.ts(41)` error, but emits.
- 2026-11-03 (step 7): **Goals backend.** Tables `goals`, `goal_links`, `goal_progress_events` (migration `20261102190626_goals`, generated by hand like step 5), pure rules `api/src/domain/goal-rules.ts` (tested), service `goals.ts`, 14 RPCs.
  - **Slider goals can't have links**: `LinkGoalItem` on a slider goal is `InvalidInput` ("Switch this goal to a count first"), never a silent conversion. Switching mode is `UpdateGoal({ progressMode })`, refused while the goal has links; it carries progress over (a count becomes its percent; a percent becomes that share of the new target, rounded down so an unreached goal never becomes reached). `targetCount` alone changes a count goal's target, which can complete or reopen it.
  - **Paused (and completed) goals still take linked progress**: progress tracks the work actually done, and every undo has to find what its tap added, so skipping some changes would make undos wrong. Pausing only hides a goal from `/now`. A paused goal that reaches its target becomes `completed`; a completed goal can't be paused (reopen first).
  - **Completion** happens on crossing the target: reaching it from below completes (from `active` or `paused`), dropping below reopens to `active`. An explicit reopen at the target leaves the goal active until it drops below and reaches it again (or a higher target is reached). A `CHECK` holds `completed ⇒ reached`. Counts can pass the target (taps keep counting); the percent stays 100.
  - **Percent**: `progress_percent` (numeric 5,2) is stored for both modes, derived by `goalPercent` for counts and rounded **down**, so it reads 100 only once the target is reached. Counts and targets are whole numbers up to 1,000,000; slider values take two decimals. Manual changes are clamped to the range.
  - **Undo safety**: an undo or un-settle takes back `min(amount, what this item still has added)`, read as the net of its `goal_progress_events`. For habits that's per check-in day, so `goal_progress_events` gained a `source_date` column. So a tap from before the link, or a link whose amount was raised after the settle, never takes back more than was added. Linking doesn't count past taps or settles; unlinking keeps the progress already added.
  - **Deleting items**: deleting a settled task takes its amount back (step 3's seam), then drops its links. Deleting a habit keeps the progress its taps added and drops its links (wiping months of progress would be surprising).
  - **Activity**: one `goal_progressed` row per goal and local day, updated in place (`occurred_at`, `meta.valueAfter`, `meta.percent`; `meta.valueBefore` is the day's starting value) and **deleted when the day ends where it began** (a tap plus its undo leaves nothing on Live). Meta keys are camelCase like `habit_completed`'s. Mode switches and target changes write no progress event. `goal_completed` is written on completion and deleted on any reopen.
  - **Day view**: `ListGoalsForDay` returns active goals created on or before the day, plus goals completed that day (both in the user's zone); paused goals are left out.
  - **Links lookup** is a small RPC, `ListItemGoals({ itemType, itemId })`, rather than changing `GetTask`/`GetHabit`'s shapes. At most 50 links per goal; linking again changes the amount. `UnlinkGoalItem` returns nothing and is idempotent.
  - **Hooks**: `onTaskSettled`/`onTaskUnsettled`/`onHabitCheckIn` live in `goals.ts` (the habit seam now also gets the check-in date). They lock the linked goals in id order inside the caller's transaction.
  - **Browser**: `rpc.ts` re-exports `goalPercent`, `goalValue` and `isReached`.
  - **Manual check**: like steps 3 and 5, against a throwaway Docker `postgres:17` with every migration applied, calling the services (41 checks: the LeetCode example with taps and undos, pre-link taps, amount changes, settle/unsettle, complete/reopen/recomplete, target changes, paused progress, slider rules, mode switch, isolation, reads, deletes, one `goal_progressed` row per day).
  - **For step 8**: `api/lib` is stale again, so rebuild it with `tsc -b` (dev servers stopped) before the UI calls goal RPCs. The `/now` Show filter's Goals placeholder and the bottom goals tab are waiting. Values to use: `GoalsForDay` (`active`, `completed`), `GoalSummary` (`goal`, `links` with `itemTitle`, `events` newest first: 10 in the list, 50 in `GetGoal`), `ItemGoal` for the task and habit cards. The link picker should offer links only on count goals, and the mode switch only when a goal has no links.
- 2026-11-03 (step 8): **Goals UI.** `components/goal-progress.tsx` (bar, slider, `/now` cards, completed rows), `goal-dialog.tsx` (create/edit), `goal-links.tsx` (links panel, pickers, "Moves goal"), `routes/_app/goals.tsx`; data in `hooks/use-goals.ts`, wording in `lib/goals.ts`.
  - **Color**: every goal wears the `goal` system tag's color (`data-tag`, `useGoalColor()`, violet until tags load); a completed goal turns `--success`.
  - **`/now`**: Show = Goals lists the active goal cards. Show = All lists them under a small "Goals" heading after tasks and habits, every day (goals show every day until completed). Completed-that-day goals join Settled and the bottom goals tab, whose title is the status ("Goals 2", "No active goals", or "Goal completed" in `--success`). N and the floating button add a goal in the Goals view.
  - **Progress controls**: count goals get an **"Add one"** button (the user found "+1" odd), sent one after another per goal like habit taps; slider goals get the shadcn `Slider` (added as `components/ui/slider.tsx` from the existing `radix-ui` package, no new dependency), saved 450 ms after it rests. Both show at once (`useGoalProgress`): the newest answer wins until the refetched list is as new (`updatedAt`). Percent beside a bar is whole, "<1" once started, never 100 before the target.
  - **Celebration**: when a shown goal turns `completed` while on screen (from "Add one", the slider, or a linked habit tap or settle), its check bursts (`habit-burst`) and a band of light crosses its bar once (`--animate-goal-sweep`); it stays among the active cards for 1.6 s, then moves to Settled. Never on load; skipped with reduced motion (`useJustCompleted`).
  - **Refetching**: habit and task writes now also invalidate the `goals` reactivity key (a tap or settle can move a linked goal, and edits change link titles).
  - **Goal card**: one form saved as a whole ("Add goal" / "Save", "Adding…"/"Saving…" while it runs), like the habit card. Measured by Count (Progress "x of target") or Slider (a slider). Switching to Slider is refused while it has links. The **links panel** is part of the form: the picker searches non-archived habits and open tasks (`ListTasks` `status: idle|working`, title search, 20); each link has an amount; on Save it unlinks removed ones first (so a mode switch can follow), then updates, then sets progress (only if the user moved it), then links new or changed ones. A new goal links after `CreateGoal`; if a link fails the goal still exists and a toast says which. Delete is in the card's footer and in `/goals`' menu.
  - **From the other side**: "Moves goal" on the habit card and task card (`ItemGoalsField`) lists the goals with their amounts, picks from count goals (slider goals are hidden with a note), or creates a count goal inline (name + target). The habit card saves its goals with the rest of the form (after the habit); the task card saves each change at once, like its other fields; a new task links after it's created. `useItemGoalSync` does the unlink / create / link diff.
  - **`/goals`**: `?status=paused|completed` tabs (absent = Active) with counts, like `/habits`. Each row: the bar or slider plus "Add one" (active only), "142 / 250" and the days left, "Completed <day>", linked items as chips, and a **progress line**: plain SVG, a stepped line (the value holds until the next change) from the latest 10 `goal_progress_events` to now, scaled to the target (dashed) or 100%. Menu: Edit, Pause/Resume, Reopen, Delete (AlertDialog).
  - **Backend fix**: `ListGoals`/`GetGoal`'s ranked events query failed on Postgres: this drizzle-orm build renders a subquery's selected columns as empty in `where`/`order by` (`where  <= $3`). `loadEvents` now names them with `sql.identifier`. Step 7's Docker check didn't run `ListGoals` against Neon.
  - **Manual check** (dev stack, real account): the LeetCode goal (250) created with the "Solve LeetCode problems" habit linked at +1 in the same form; a pre-link tap's undo left the goal at 0; tapping the habit on `/now` moved it to 1 / 250 without a reload; the habit card listing its goal; an inline count goal from the habit card (created, but its link call was cut off by a page reload during the slow save, so that link isn't verified); linking from the task card; complete (Add one ×2 on a target-2 goal), Completed tab, reopen, delete; 375px and dark mode on `/now` and `/goals`.
- 2026-11-03 (step 8, follow-up): **`/now` polish and tag filters.**
  - **"Move Goal"**: a count goal's +1 is a small tab hanging from the goal card's bottom-right edge on `/now` (an inline button on `/goals`), named "Move Goal" at the user's request, filled with the goal color (`bg-tag`, `text-primary-foreground`) so it stands out.
  - **Settled messages** (a check in `--success`, `SettledState`): All shows "Everything today is settled." when no open tasks, due habits or active goals are left and something was settled (sessions join the rule in step 11: none running or paused), else "All tasks today settled." once the day's tasks are; Tasks shows "All tasks today settled."; Goals shows "All goals today completed."; Habits shows "All habits today checked." (other days read "on Wed, Nov 4"). In All, the empty-list message waits until habits and goals have loaded, so it doesn't flicker.
  - **The habits and goals tab row is gone** (the user found it redundant): Settled already holds checked habits and completed goals, and the views show the rest. A completed goal in Settled shows a target in the goal color with a small green check, distinct from a settled task's check.
  - **Tag filter, several tags at once** (`components/tag-filter.tsx`): a task shows when it has any picked tag. `/tasks` keeps them in `?tags=` (an array) and `ListTasks` takes `tagIds` (any of, up to 50) in place of `tagId`. `/now` has the same filter beside Show, remembered in its view options (`tags`). Habits and goals wear their system tags there, so with a filter on they show only when the `habit` or `goal` tag is picked.
- 2026-11-03 (step 9): **Notes.** Table `notes` (migration `20261102204051_notes`, generated by hand like step 5), pure rules `api/src/domain/notes-rules.ts` (tested), service `notes.ts`, RPCs `CreateNote`, `UpdateNote`, `DeleteNote`, `ListNotesForDay`, `ListNotes`. UI: `components/note-composer.tsx`, `routes/_app/notes.tsx`, `hooks/use-notes.ts`, `lib/notes.ts`.
  - **Body**: trimmed, 1–60, one line (`NoteBody`). Counted in UTF-16 units like the input's `maxLength`, so the API is never looser than the database's `CHECK char_length(body) between 1 and 60` (code points). The UI turns pasted line breaks into spaces and trims.
  - **Today only**: `CreateNote` takes no day; the server writes today in the user's zone. An optional `date` must equal that day (`InvalidInput` otherwise), so a tab left open past midnight can't post onto the wrong day. `local_date` never changes on edit; past notes can be edited and deleted.
  - **Daily cap**: 50 notes per local day (`MAX_NOTES_PER_DAY`, `NoteLimitReached`). Creates lock the settings row (like tags), so concurrent posts can't pass it.
  - **Activity**: `note_created` is written with the note (dated on its `local_date`) and deleted with it; edits don't touch it.
  - **Index**: one index `(user_id, local_date, created_at, id)` covers the day view, the cap count and (scanned backwards) `ListNotes`.
  - **`ListNotes`**: newest day first, then newest note, cursor `<date>|<ISO>|<id>` (the day leads because a zone change can put `created_at` out of step with the day). Pages split by note and come grouped by day (`NotePage.days`); the client merges a day that runs over a page boundary. `query` is a literal `ILIKE` like `ListTasks` (reuses `titleSearchPattern`). Default 50, max 100.
  - **`/notes`** (full width, at the user's request): a composer with the user's avatar, a ring that fills toward 60 (it grows and shows the count for the last 10, in `--note-limit`), a privacy pill menu and an "On Live / Off Live" toggle, both starting from the settings defaults. Notes read like posts, grouped by day in one card per day: avatar, name, @username, time (full date on hover, "(edited)" after an edit), body, and privacy and Live pills. A post shows faded in today's group until the list has it. Search is `?q=` (debounced, matches highlighted). Inline edit by double-click or the menu (Enter saves, Escape cancels); the menu also changes privacy and Live, and Delete asks first. Edits show at once (`useOptimisticNotes`).
  - **Live card**: `NoteComposer` became `CompactNoteComposer`, posting today's note with the default privacy; "N notes today" under it links to `/notes`.
  - **Tokens**: `--note-meter` (teal) and `--note-limit` / `--note-limit-ink` (orange) from the tag palette. The Live card's countdown moved from marigold to `--note-limit-ink`, so marigold stays Tibo's.
  - **Manual check**: like steps 3, 5 and 7, against a throwaway Docker `postgres:17` with every migration applied, calling the services (26 checks: defaults, the 60/61 boundary in the schema and the `CHECK`, today-only, past edits, isolation, day list, grouping, search with wildcards, cursor walk, delete with activity, the cap with concurrent posts, activity rows matching notes). Then in the browser: post, 61st character stopped, edit, privacy change, search, and the Live card count.
- 2026-11-03 (step 10): **Focus sessions backend.** Tables `focus_sessions`, `focus_session_segments` (migration `20261102210529_focus_sessions`, generated by hand like step 5), pure rules `api/src/domain/session-rules.ts` (tested), service `sessions.ts`, 9 RPCs.
  - **The sweep lives on the ApiWorker**, not a separate Worker: `Cloudflare.Workers.cron("* * * * *", …)` in `api.ts`, with `CronEventSourceLive` provided. `RpcWorker` wraps `Cloudflare.Worker`, so the cron attaches to the same script, and the sweep reuses the ApiWorker's Hyperdrive Drizzle db. Failures are logged and swallowed (the next minute retries).
  - **One completion path**: `completeExpiredSessions(tx, { now, userId? })` serves both the sweep (all users, batches of 200 in their own transactions, at most 25 batches a run) and the lazy completion that every session read and write runs first for its user. It picks rows with `FOR UPDATE SKIP LOCKED`, sets `completed`, `ended_at = ends_at` and closes the open segment at `ends_at`, writes `session_completed` dated in the user's zone, and calls `onSessionCompleted(tx, rows)` (the no-op seam for step 20; stopped sessions never reach it). A second run finds nothing, so it's idempotent.
  - **`local_date` column** (not in the original model): the start day in the user's zone, fixed at start like notes. Per-day reads and `ListSessions` order use it, so no zone math in SQL. A session belongs to the day it started, even past midnight.
  - **`ends_at` is set exactly while running** (`CHECK`); completed and stopped sessions keep only `ended_at` (also a `CHECK`). At most one open segment per session (partial unique index).
  - **One active session**: partial unique index `focus_sessions_one_active_idx`. `StartSession` locks the settings row (serializing a user's starts), completes expired sessions, then fails with `ActiveSessionExists { session }` or, with `replaceActive`, stops the old one (`session_stopped`) and starts the new one in the same transaction. An expired session never blocks a start.
  - **Transitions**: pause needs `running`, resume `paused`, extend and stop either; anything else is `SessionTransitionNotAllowed { status }`. Extending past 600 minutes in all is `InvalidInput`. Extending a paused session keeps `ends_at` null; resume computes it from the time left. Inputs take `shareToLive` (the prompt's `share`) like other items.
  - **Values**: `FocusSession` carries `elapsedMs` and `remainingMs` as of the response (the client counts down from `endsAt` while running and shows `remainingMs` while paused). `SessionsForDay` and each `SessionDay` carry `focusedMinutes` (all segments that day, stopped sessions included, rounded down); a day split across `ListSessions` pages has its full total on both. The cursor reuses the notes cursor shape (`<date>|<started_at>|<id>`). `rpc.ts` re-exports `elapsed`, `remaining` and `computeEndsAt`.
  - **Deleting** works in any status and removes the segments (cascade) and all its activity.
  - **Manual check**: like earlier steps, against a throwaway Docker `postgres:17` with every migration applied, calling the services (45 checks: start defaults, `ActiveSessionExists`, the index rejecting a raw second active row, `replaceActive`, pause/resume/extend `ends_at` math, refusals, isolation, sweep completion and idempotency, lazy completion on read and on start, per-day totals, paging, delete, `CHECK`s).
  - **Under `alchemy dev`**: the local runtime starts a timer per cron expression, so the sweep should run every minute; it also exposes the Miniflare-style manual route `/cdn-cgi/handler/scheduled` on the Worker's local URL (pass `?cron=*+*+*+*+*`, since the handler only answers its own expression). Not yet run under dev. Either way, any session read completes an expired session.
  - **For step 11**: `api/lib` is stale again; rebuild it with `tsc -b` (dev servers stopped) before the UI calls session RPCs.
- 2026-11-03 (step 11): **Focus sessions UI.** `components/focus-session.tsx` (widget, day list, header timer, `SessionSync`), `components/privacy-controls.tsx`, `routes/_app/sessions.tsx`; data in `hooks/use-sessions.ts`, wording in `lib/sessions.ts`. Checked in the browser against `alchemy dev` (desktop and 375px, light and dark).
  - **Where the widget lives**: in `/now`'s Sessions tab (the bottom tab row), with its height cap raised to `min(26rem, 52dvh)` on today. The top row's "Start a session" opens and unfolds that tab (`useOpenSessionsTab`, a keep-alive atom `/now` clears once it's open), going to today first. While a session is active, its timer replaces that button. On past days the tab is that day's read-only list; future days say sessions start on the day itself.
  - **Countdown**: it never compares the browser's clock with the server's. Each answer's `remainingMs` is counted down from when the answer arrived (`receivedAt`, a `WeakMap` per session object), which is wall-clock time, so it stays right after tab sleep. `SessionSync` (mounted once in `_app`) refetches the `sessions` key on `visibilitychange`/`focus` (at most every 2 s). At 0 it shows the completion moment, toasts, refetches `GetActiveSession`, and asks again every 5 s while the answer still says running.
  - **Writes show at once**: each write's answer is shown until the refetch it triggered lands (`writtenAtom`), since the dev DB answers in seconds.
  - **Replace-active**: Start sends no `replaceActive`; `ActiveSessionExists` opens a warning with the other session's name and its live time left, and confirming retries with `replaceActive: true`. When the widget already knows a session is active ("Start a different session" under the countdown), it asks before calling.
  - **Done moment**: only for a session whose countdown reached 0 in this tab (`finishedAtom`), kept until "Start another". The bar fills `--success` and the check bursts (`habit-burst`); `useReducedMotion` skips it. A session that finished while the app was closed just shows as completed in the day list.
  - **Header timer** (`SessionIndicator`): on every `_app` page. It sits in the top row's end area where that row is drawn anyway; it never draws the row by itself (that pushed pages like `/inbox` down), so elsewhere it floats in the top corner (`/inbox`, and pages without controls of their own on phones). It links to `/now` and opens the Sessions tab. `/now` sets `topBar.session: false`, since its start slot shows the timer. While running, the tab title starts with the time left (`24:13 · Now · Dueboard`).
  - **Tokens**: `--focus`, `--focus-soft` and `--focus-ink` (tag indigo), plus `--animate-focus-breathe` for the running dot. The countdown is Geist extralight with tabular numbers, over a bar that drains.
  - **Start form**: presets 15/25/50/90 and a custom field (1–600), an optional label, and the privacy pill and Live toggle from the settings defaults. The last length started is remembered in localStorage (`dueboard-session-minutes`). The privacy pill and Live toggle moved out of `NoteComposer` into `privacy-controls.tsx`, shared by both.
  - **Extend**: +5, +15, and "+" for any amount up to what the 600-minute cap leaves. Stop and delete each ask first.
  - **`/sessions`**: `?status=completed|stopped` (absent = All). `ListSessions` has no status filter, so the loaded pages are filtered in the browser (like `/tasks`' Unscheduled). Each day shows its `focusedMinutes` from the API: the whole day's total, stopped sessions included, whatever the filter. Rows show the start time, name, "focused of planned" and status, with delete (the row hides at once). Still not linked from the nav; step 12 can decide.
  - **`/now` "Everything settled"** now also needs no session running or paused today.
  - **Retries never cancel a request in flight**: a reload invalidates the `sessions` key, which aborts the requests still running. With the dev API taking over 5 s, the 5-second retry at 0 aborted every answer and the timer sat at 0:00, so `SessionSync` now skips a reload while `GetActiveSession` is waiting (`useActiveSession().waiting`).
  - **One time-left helper** (`remainingAt(session, now)` in `use-sessions.ts`) for every countdown, using the shared arrival stamps. The replace warning had kept its own stamps, so it counted from when the dialog opened and showed more time than was left.
  - **Ticks share a wall-clock beat** (`useTicker` lands on multiples of its interval), so the widget, the header timer and the tab title never show different seconds.
  - **Timers on screen use `useTimerSession()`**: a session whose countdown reached 0 here is gone from the header and `/now` at once, not left at 0:00 until the server's answer lands. `SessionSync` keeps the raw active session so its retry still runs.
  - **Phones**: session rows put "focused of planned" under the name, and `/now`'s bottom tab panels get bottom padding so the last row scrolls clear of Tibo's floating button.
  - **Stop's wording**: stopped sessions still count in focused minutes, so the stop dialog says only completed sessions count *on the activity graph* (planning §133). A remembered length that isn't a preset shows in the Other field.
- 2026-11-03 (step 12): **Day view and Upcoming.** Service `api/src/domain/days.ts` (`getDay`, `getUpcoming`), pure rule `occurrences` in `habit-rules.ts` (tested), RPCs `GetDay` and `GetUpcoming`. UI: `hooks/use-day.ts`, `hooks/use-upcoming.ts`, `components/upcoming-sheet.tsx`. Checked in the browser against `alchemy dev` (desktop and 375px, light and dark).
  - **`GetDay`** returns `Day` (tasks, unscheduled, habits, goals, sessions, `notesCount`), built from the existing per-day services run with `Effect.all({ concurrency: "unbounded" })`. Each read is its own query (sessions its own transaction) on the `@effect/sql-pg` pool, so they don't share a connection. **Unscheduled comes on every day**, not only today, keeping step 4's decision. The old per-day RPCs stay (`/tasks` still uses `ListUnscheduledTasks`); `/now` no longer calls them.
  - **One atom per day** (`dayAtom`, keys `tasks`, `habits`, `goals`, `sessions`, `notes`). The per-section atoms (`tasksForDayAtom`, `habitsForDayAtom`, …) are `Atom.mapResult` views of it, so the hooks and their optimistic logic didn't change. The Live card's "N notes today" reads `notesCountAtom(today)`.
  - **Prefetch**: once a day has loaded, `/now` keeps the days before and after it mounted, so ← → render at once and each step fetches only the new neighbor. Checked: a fresh `/now` makes one `GetDay` plus two prefetches. Mounted neighbors refetch on every write too (3 `GetDay`s per write), which is fine under the 120/min RPC budget but worth watching.
  - **Active session key**: `SessionSync` used to reload the `sessions` key on every window focus and every 5 s at a countdown's end. That now reloads three whole days (and aborted slow `GetDay`s), so `GetActiveSession` also carries `active-session`, `SessionSync` refreshes only that, and it reloads `sessions` only when the active session's answer changed (completed while away, stopped elsewhere).
  - **Pre-existing**: on a fresh load every query is started and aborted within a few ms once or twice (`Bootstrap` and `GetActiveSession` too) before the request that stays. It predates this step; not chased.
  - **Upcoming is a sheet**, not a route: `/now` is a one-screen, two-card layout and the task, habit and goal cards are mounted there, so a sheet keeps the day behind it and opens the same cards on top. From the right on wide screens (`max-w-md`), from the bottom (88dvh) on phones. **Entry point** (step 2 left it open): an "Upcoming" button in the day card's top-right corner (icon only on phones), and the U key. Not in the URL.
  - **Upcoming content** starts tomorrow, in pages of 14 days ("Load more days", up to a year ahead; `GetUpcoming` takes 1–60 days and refuses a `from` before today). Per day: open tasks assigned or due (a task with both dates shows on both; settled ones are left out), habits, and active goals with that target date. Paused and archived habits and goals never show. Each day has a sticky header ("Tomorrow" with the date, or "Thu, Nov 5" with "in 2 days") and "Open day", which shows it on `/now`. Gaps between days read "3 free days". Task rows are `/now`'s rows (settle works); each day has its own `LayoutGroup`, since a task on two days shares a `layoutId` and motion hid one copy.
  - **Habits in Upcoming** (`occurrences`): specific-days habits on each of their days; flexible ones once per period, on its first scheduled day in range, as "3 this week", "1 more this month" (taps already in the current period) or "2 by Tue, Nov 10" for multi-unit periods; a period already met is left out. A daily count is its own period, so it shows every day ("5 times").
  - **Past and future days on `/now`**: a quiet summary line under the heading: past days "1 task settled, 1 habit checked, 45 min focused, 2 notes" (notes links to `/notes`), future days "1 task planned, 4 habits due, 1 goal due" (counts above zero only; "Nothing was recorded this day." / "Nothing planned yet."). Past days open the bottom tab row unfolded on Settled. Empty states read by tense ("No tasks were planned on …", "Nothing planned on … yet. Add a task …", "No habits were due on …", "Nothing was settled on …"). Settled and Unscheduled show a skeleton while the day loads instead of their empty text. Future habit cards stay read-only (unchanged).
  - **Gotcha**: shadcn's `SheetContent` sets `data-[side=bottom]:h-auto` and `sm:max-w-sm`, which beat plain classes; the sheet uses `h-[88dvh]!` and `sm:max-w-md!`.
- 2026-11-03 (step 13): **Profiles, connections, blocks, settings.** Tables `connection_requests`, `connections`, `blocks` (migration `20261103081000_social`, generated by hand like step 5), pure rules `api/src/domain/social-rules.ts` (tested), services `social.ts` and `account.ts`, 11 RPCs. UI: `routes/@{$username}.tsx`, `routes/_app/settings.tsx` (tabs), `components/{app-shell,connection-actions,people-search,person-avatar}.tsx`, `components/ui/switch.tsx` (from the existing `radix-ui`), `hooks/use-social.ts`, `hooks/use-settings.ts`.
  - **Public RPC design**: a separate group `PublicRpcs` (only `GetProfile` for now) with its own middleware `OptionalAuthentication`, which provides `Viewer` (`{ user: { id, username } | null }`; a session without a username counts as logged out). It's merged into `ApiRpcs` after `.middleware(Authentication)`, so it's served at the same `/rpc` endpoint by the same client, and every other RPC still requires sign-in. Logged-out callers are limited per IP (1008, `cf-connecting-ip`, which the `/rpc` proxy forwards), signed-in ones by the usual per-user 1004. Public RPCs must decide visibility themselves (and through `visibility.ts` from step 14).
  - **Profile URL**: the route file is `web/src/routes/@{$username}.tsx` (TanStack's literal-prefix syntax), path `/@{$username}`. The username is lowercased (Better Auth stores it lowercased). It sits outside `_app`; when the viewer is signed in and onboarded it wraps itself in `AppShell`, the `_app` chrome extracted into a component (so moving between `_app` pages and a profile remounts the chrome and reruns Bootstrap). Logged out it gets a small public header (wordmark, theme, Sign in).
  - **Better Auth's tables** are read through `domain/auth-users.ts` (a `pgTable("user")` kept out of `schema.ts`, so drizzle-kit never tries to create it). Read-only: account deletion goes through Better Auth.
  - **Blocks**: someone who blocked the viewer is `UserNotFound` everywhere (profile, requests, search), the same as a username nobody has, so a block is never revealed. A viewer who blocked someone still sees their card (`state: "blocked"`, no counts, no diary placeholders) to unblock from, and finds them in search marked blocked. Blocking removes the connection, cancels the blocker's pending request and declines the other's. Unblocking restores nothing.
  - **Requests**: sending to someone who already asked accepts both at once. Sending again while pending returns the existing request. Declined requests are silent (the sender just sees no request). Removing a connection, blocking and unblocking are idempotent. Pair writes take `pg_advisory_xact_lock(hashtext('social:<low>:<high>'))`, so crossed requests can't leave two pending rows.
  - **Rate limits**: the binding counts only per 10 or 60 s, so "20 a day" is `CONNECTION_REQUESTS_PER_DAY`, counted from `connection_requests` over the last 24 hours (every status, so send/cancel cycles count), with 1006 as a 5/min burst limit. People search got its own namespace, **1011** (30/min per user). Both are checked inside the service through `RateLimiter`. Errors are `SocialLimitReached`.
  - **Connection state** (`SocialStatus.state`): `self`, `none`, `pending_out`, `pending_in`, `connected`, `blocked`, with `requestId` for the pending ones. Logged-out viewers get `none`. **Profile counts** are all-time totals of `task_settled`, `habit_completed`, `goal_completed`, `session_completed` and connections (counts are public, like the graph).
  - **People search**: exact username or prefix of at least 2 characters (`_` escaped in `LIKE`), exact match first, at most 10, leaves out the viewer and anyone who blocked them, signed-in only (no enumeration while logged out). It's in Settings → Connections.
  - **Settings** (`/settings?tab=tags|connections|tibo|account`, General without a param): General (default privacy as a radio group, Live default as a switch, time zone, theme), Tags (create, edit, recolor; system tags only recolor, through the existing `TagDialog`), Connections (search, requests, connections, sent, blocked), Tibo (relay policy, stored for step 21), Account. Each choice saves at once. `UpdateSettings`' answer goes into `savedSettingsAtom` (`use-bootstrap.ts`), which `useBootstrap` prefers over Bootstrap's copy, so composers and cards use the new defaults without a reload. The services already read the defaults on create.
  - **Account deletion**: `DeleteAccount({ confirmUsername })` (the username, `@` and case ignored). `account.ts` deletes every user-owned row in one transaction (`USER_OWNED_TABLES`; `account.test.ts` fails when a schema table isn't covered), runs `onAccountDeleted(userId)` (no-op seam for step 17's `TiboAgent` wipe), then `AuthAccounts.deleteUser`, which `api.ts` implements with Better Auth's `internalAdapter.deleteUser` (user, sessions, accounts). The browser then calls `authClient.signOut()` (clears the cookies and the cached session copy) and loads `/`. If the Better Auth step fails, the user keeps an empty account and can retry.
  - **Avatars**: `PersonAvatar` shows the Google picture with `referrerPolicy="no-referrer"` and falls back to up to two initials (`lib/people.ts`); `UserAvatar` uses the same initials now. The user menu's "Your profile" is a typed `Link`.
  - **Profile card**: a band in the owner's user color (`.profile-band` in `styles.css`: the soft shade ruled with fine lines of the solid one), the avatar overlapping it, name, @username in the user color's ink, join month, then the counts. The graph and diary are dashed placeholders for step 15.
  - **Manual check**: like earlier steps, against a throwaway Docker `postgres:17` with every migration and a minimal Better Auth `user` table, calling the services (61 checks: request/accept/remove, crossed requests, byte-ordered pairs with mixed-case ids, decline/cancel, block hiding both ways, refusals, search rules, both rate limits, the daily cap and its 24-hour window, the `CHECK`s and the pending index, settings defaults reaching new tasks and notes, deletion leaving no rows and calling the auth deletion). Then on `alchemy dev`: own profile signed in (desktop and 375px), Settings tabs, search, saving a default and seeing it in the note composer; `GetProfile` without cookies answers, an unknown username is `UserNotFound`, and `GetSocialOverview` without cookies is `Unauthorized`. Two accounts in the browser weren't possible (sign-in is Google-only), so the two-user flows are covered only by the service check.
- 2026-11-03 (step 13, follow-up): **Tags, Discover and Connections pages; profile tabs.** At the user's request.
  - **`/tags`** (`routes/_app/tags.tsx`) replaces Settings' Tags tab: "Your tags" and "Built-in tags", each tag with Edit / Recolor (the existing `TagDialog`), "New tag" in the header (and N). `/tasks` has **Manage tags**: an outline button left of "New task" on wide screens, a ghost button after Sort and Group on phones (`ViewControls` gained an `extra` slot). The phone search field on `/tasks` is a little smaller (`h-7.5`, at most 13rem wide).
  - **`/discover`** (`routes/_app/discover.tsx`): people search, incoming requests (Accept / Decline), sent requests (cancel), and a "Your connections" button. In the desktop sidebar after Boards with the Search icon (`DISCOVER_NAV`); not in the phone tab bar. **`/connections`**: the user's own connections with Connected ▾ (Remove, Block). Settings' Connections tab now holds only the blocked list. Shared list pieces: `components/people-lists.tsx`.
  - **Boards** adds Profile, Discover and Settings cards (`BOARD_EXTRAS`; Profile is built by the page since it needs the username). Nine cards now sit in rows of three at every width, phones included (the six-across `xl` row is gone).
  - **Settings rows** keep the control on the right on phones too (below the description).
  - **Profile**: the counts moved out of the card. The card ends with a row holding the connections count, which links to `/connections` on your own profile only: other people's connection lists aren't viewable (an open question for later). The right end of that row is kept for points. Below the card, tabs (`?tab=`, absent = Overview): Overview has four count tiles (tasks settled, habit goals met, goals completed, focus sessions) and the activity graph placeholder; Tasks, Habits, Goals, Diary and Sessions are placeholders until steps 14–15. Someone you blocked shows the card only.
- 2026-11-03 (step 13, follow-up 2): **Profile items, points, leaderboard, name search.** At the user's request; this pulls part of steps 14–15 forward.
  - **Visibility**: `domain/visibility-rules.ts` (pure, tested: `visiblePrivacies`, `canSeeItem`) and `domain/visibility.ts` (`viewerRelation`: self / connected / other / blocked; logged out is other). Step 14 builds Live on the same module.
  - **Profile tabs** read `GetProfileItems({ username, feed, cursor? })`, a `PublicRpcs` read (logged-out visitors get public items). Feeds (`profile-rules.ts`): tasks = `task_settled`, habits = `habit_completed`, goals = `goal_completed`, sessions = `session_completed`, diary = all of those plus `note_created`. Activity rows are joined to their items for the title and **current** privacy, so privacy changes apply at once; newest first, 30 a page, cursor `<ISO>|<activity id>`. Someone who blocked the viewer is `UserNotFound`; the blocker gets an empty page. The owner sees each non-public item's privacy. UI: `components/profile-feed.tsx`, grouped by day, Load more. Overview still has the graph placeholder (step 15).
  - **Points** (`domain/points.ts`, `points-rules.ts`): counted, not stored. +1 per settled task, per completed session, per goal moved on a day (its one `goal_progressed` row) and per habit checked on a day (a `habit_checkins` row with `count > 0`), so tapping many times or tapping and undoing can't farm points, and undos take them back. Private items count. Shown in the profile card's connections row (right side) as `ProfileCounts.points`.
  - **Leaderboard**: `GetLeaderboard({ scope: connections|public, period: all|month|week|today })`, signed-in only. Periods start in the viewer's zone (weeks on Sunday) and compare with each row's `local_date`. Top 50 by `rank()` (ties share a rank) plus the viewer's own row (`me`); people blocked either way are left out; users without points don't appear. `/leaderboard` defaults to Connections and This week. Sidebar after Discover (Trophy icon) and a Boards card; Boards now has ten cards, two per row on narrow screens and five from `md` (descriptions from `lg`).
  - **People search** matches the name too: any part, case-insensitive (`ILIKE`, wildcards escaped), alongside the username prefix. Order: exact username, other username matches, then name matches. It now **includes the user themselves** (status `self`): searching your own name and finding nothing looked broken. Queries can hold spaces (up to 60 characters).
  - **User menu** has "My connections" (`/connections`) under "Your profile", in both the sidebar and the phone Profile menu.
  - **Manual check**: a throwaway Docker `postgres:17` script (35 checks: tab contents by relation including logged out and blocked, completed-only, privacy changes, paging, points including undo behaviour, leaderboard scopes, periods, ties, blocks, name search) plus the earlier social script (62, updated for self in search). Then on `alchemy dev`: your profile's Tasks and Diary tabs with real data, points in the card, `/leaderboard`, and finding "aritra ghose" in Discover.
- 2026-11-03 (step 14): **Live dates (decided by the user; the plan's "follow the selected date" was dropped).** Live ignores `/now`'s date. The card on `/now` shows the **last 2 days** (today and yesterday in the viewer's zone) like a chat: newest at the bottom by the note box, opening at the newest, older events loading as you scroll up. `/live` shows the **last 7 days** as a feed: newest at the top, older loading as you scroll down. `GetLive({ days: 1–7, onlyMine, cursor? })` takes the window; the day starts at midnight in the viewer's zone. Filtering events by date or anything else comes later.
  - **Visibility module**: `visibility-rules.ts` now has `relationOf`, `canSeeItem(viewerId | null, ownerId, privacy, { connected, blocked })`, `canSeeOnLive` and `liveDisplay` (63 table tests: every privacy × share × viewer, including logged out, blocked, and blocked-while-connected). `visibility.ts` builds the same rules as SQL so readers filter in the database: `canSeeItemSql`, `privacyVisibleSql` (one owner, known relation), `liveActorSql`, `connectedSql`, `notBlockedSql`, plus the activity-subject joins and coalesced `activitySubjectPrivacy`/`ShareToLive`/`Title`/`Exists`. `GetProfileItems` now uses them too; later readers (diary, Tibo tools, Ask context) must.
  - **`GetLive`** (`domain/live.ts`, signed-in only): activity of the viewer and their connections (not blocked either way), whose item still exists and has `share_to_live`, newest first, 30 a page, cursor `<ISO>|<id>` like the profile tabs. Each event has the actor (username, name, image, user color), `mine`, kind, `occurredAt`, `display` (`full`, or `redacted` for other people's private items, which drops the title) and `meta` (`percent` and `rose` for goal progress; `minutes`: planned when a session starts or completes, time focused when stopped). The first page also says `hasConnections` for the empty state.
  - **Live UI**: `components/live-card.tsx` (`layout="chat"` on `/now`, `"feed"` on `/live`), `hooks/use-live.ts`, wording in `lib/live.ts`. Sentences: "ar1tra settled a task: add rate limiter"; goals say "reached 40% on a goal" (or "moved a goal back to 35%"); sessions "started a 25-minute focus session". The username is in the user's color; avatar and name open `/@username`. Times are relative today ("12 min ago"), clock times before; days are grouped under sticky "Today" / "Yesterday" / "Sun, Nov 1" headings. **Only mine** is a header toggle remembered in localStorage (`dueboard-live-only-mine`); collapse keeps step 2's key.
  - **Freshness**: the newest page is a query atom with every write's key (`tasks`, `habits`, `goals`, `sessions`, `notes`, `social`) plus `live`, so your own changes and privacy edits show at once. It polls every 45 s by invalidating `live` while the tab is visible, pauses while hidden, and catches up on return. Older pages are fetched once as you scroll and kept under the newest page; if more than a page arrives at once, the older pages are dropped and reloaded on scroll, so nothing is skipped. Older pages don't refresh until the next load.
  - **Empty state** without connections points to **`/discover`** (people search moved there from Settings in step 13's follow-up), not `/settings` as the prompt said.
  - **`/live`** got `/now`'s fixed height, so the feed scrolls inside the card with the note box in view.
  - **Note box on `/now`** (at the user's request): the Live card's compact composer now has the privacy pill and On/Off Live toggle under it, starting from the settings defaults, like `/notes`.
  - **Manual check**: a throwaway Docker `postgres:17` script (35 checks: two-plus accounts with public/connections/private × share on/off, redaction, Only mine, strangers and blocked users never shown, privacy and share changes applying at once, un-settle and delete removing events, orphaned rows never shown, unblock not reconnecting, removed connections, goal and session meta, the 2- and 7-day windows in the viewer's zone, paging, `canSeeItemSql` agreeing with `canSeeItem` for every viewer, profile tabs unchanged). Then on `alchemy dev`: `/now` (desktop and 375px, opening at the newest), `/live`, Only mine, and posting a private note from the Live box. The UI's load-older paths weren't exercised with real data (the dev account has under a page of events); the server's paging is covered by the script.
  - **Typecheck**: `api/src/agent.ts(41)` fails (`preconnect` missing on a fetch type) at HEAD too, before this step's changes; everything else passes.
- 2026-11-03 (step 14, follow-up): **Live tabs, Path, lighter rows.** At the user's request.
  - **Tabs replace Only mine**: All (default), Connections, Me, Path, in the `Segmented` control `/now`'s day card uses, on both `/now` and `/live`. The choice is remembered in localStorage (`dueboard-live-tab`). `GetLive` takes `scope: all | connections | mine` instead of `onlyMine` (`liveActorSql` handles the three).
  - **Path** (`GetPath`, `getPath` in `domain/live.ts`): the user's own today in their zone, oldest first, as one thread: a line and dots in their user color, each step with its clock time. It lists settled tasks, habits checked today (one step per habit at its last tap, from `habit_checkins` with `count > 0`, "Checked a habit 3 times"), goals moved (`goal_progressed`, one per goal and day) and completed sessions. **Private and unshared items are included**, since the Path is only ever shown to its owner; notes, session starts and stops, `habit_completed` and `goal_completed` aren't (the checks and the 100% move already cover the last two). On `/now` it opens at the latest step.
  - **Rows**: no avatars; the username in the user's color links to the profile (the name is its tooltip). Event text is 13px (`text-[0.8125rem]`), down from 14.
  - **End of the feed**: "You are all caught up" with a check, in muted text.
  - **Phones**: on `/now` the Live card's own header is hidden (the tab already says Live), so the tabs come first. The note box's privacy pill, Live toggle and notes count stay on one row, stopping short of Tibo's button.
  - **Tab switching**: the Live and Path queries keep their answer for 2 minutes after their tab closes (`timeToLive`), so switching back shows it at once while it refreshes. Polling moved to `useLivePolling` (in the card), so it runs on the Path tab too.
  - **Gotcha**: `web/` imports the api's compiled `api/lib/rpc.js`, so new API exports need `tsc -b` (with dev servers stopped) before the web dev server sees them.
  - **Manual check**: the Docker script grew to 44 checks (the Connections scope, and Path contents: kinds, unshared private items, habit counts, undone check-ins left out, session minutes, oldest first, own only). On `alchemy dev`: all four tabs on `/now` (desktop and 375px) and `/live`, the Path thread, the Connections empty state and the caught-up line.
- 2026-11-03 (step 14, follow-up 2): **`/live` reads like `/now`; habit checks on Live; Tibo in the card.** At the user's request.
  - **Both pages read like a chat**: newest at the bottom, opening there, older events loading as you scroll up, "You are all caught up" at the top. A short feed sits at the bottom by the note box. `LiveCard` takes `days` (2 on `/now`, 7 on `/live`) instead of a layout.
  - **New activity kind `habit_checked`** (migration `20261103112002_migration`, generated by `alchemy dev` and left with its generated name since the dev database had already applied it): one row per habit and day, written in the check-in's transaction, moved to the latest tap with `meta.count`, kept in place on an undo, deleted when the day is back to 0 (and with the habit). Live leaves it out on a day the habit's `habit_completed` covers, so a one-tap habit shows once ("completed a habit"). It reads "ar1tra checked a habit 2 times: Read". Points, profile tabs and counts don't read it. Check-ins from before the migration have no row.
  - **Goal moves were already on Live** (`goal_progressed`, one row per goal and day, "reached 40% on a goal"); checked again.
  - **Tibo on `/live`**: a new top-bar slot `tiboInPage` skips the row on wide screens; the page puts Tibo and the session timer in the card header's right corner (`LiveCard`'s `headerEnd`), so nothing pushes the card down. Phones keep the floating button. `/live`'s height is now `/inbox`'s (no top row).
  - **Manual check**: the Docker script is at 53 checks (habit checks: one row per day, counts, hidden once completed, back after an undo, gone at 0, redacted when private, deleted with the habit; a goal move with its percent). On `alchemy dev`: `/live` on desktop and 375px, `/now`.
  - **Compact Live header** (at the user's request): the title row and the tabs share the card header, with tighter padding (`pt-2.5`, `gap-2.5`, header `pb-2.5`), so the feed gets more height on `/now` and `/live`. On phones in `/now` only the title row hides; the tabs stay.
