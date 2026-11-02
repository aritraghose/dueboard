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
- [x] 5 Habits backend
- [x] 6 Habits UI
- [x] 7 Goals backend
- [x] 8 Goals UI
- [x] 9 Notes
- [x] 10 Sessions backend
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
