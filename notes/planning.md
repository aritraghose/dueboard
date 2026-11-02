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

- Shows the profile card, the visible diary, and a GitHub-style **contribution graph**.
- The graph counts settled tasks, completed habits, completed goals and completed sessions. Private items are counted, but no details are shown.
- Logged-out visitors can view the public parts.
- Usernames **cannot be changed**.

### Connections

- Users send connection requests, which can be accepted or declined.
- A connection can be removed.
- Users can **block** someone, which hides everything between them and stops requests, relays and the Ask page.

### Pages

- `/now`, `/inbox`, `/boards`, `/tasks`, `/habits`, `/goals`, `/notes`, `/live`, `/sessions`, `/diary` and `/settings`.
- `/boards` shows every board (Tasks, Habits, Goals, Notes, Live, Diary) as a card that opens it.
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
- [ ] 5 Habits backend
- [ ] 6 Habits UI
- [ ] 7 Goals backend
- [ ] 8 Goals UI
- [ ] 9 Notes
- [ ] 10 Sessions backend
- [ ] 11 Sessions UI
- [ ] 12 Upcoming and day navigation
- [ ] 13 Profiles and connections
- [ ] 14 Visibility and Live
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
  - **Upcoming**: there's no Upcoming button any more. Step 12 needs to agree a new entry point with the user.
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
