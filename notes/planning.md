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
  - **Timeline**: can be minimized, with a "only mine" toggle.
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
  - shareToTimeline
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
  - shareToTimeline
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
  - shareToTimeline
- **Behavior**:
  - A goal shows **every day until completed**.
  - Goals can be paused and resumed. Progress can go down, and a completed goal can be reopened.
  - **Linked items**: habits and tasks can be linked to a goal with an amount. Each check-in or settled task adds that amount.
  - Example: the goal "Solve 250 LeetCode problems" with the habit "5 problems a day" linked at +1 per tap.

### Notes

- At most 60 characters each, with several allowed per day.
- Each has privacy and shareToTimeline.

### Focus sessions

- **Fields**:
  - duration in minutes
  - optional label
  - privacy
  - shareToTimeline
- **Behavior**:
  - Sessions can be paused, resumed and extended.
  - **Only one** can be running or paused at a time. Starting another shows a warning, and confirming **stops** the old one.
  - When the time runs out, a session auto-completes even if the app is closed.
  - A session stopped early has status **stopped**. It does not count on the contribution graph.
- **Timeline**: with shareToTimeline on, the session's start and its completion (or stop) appear on the timeline.

### Tags

- Users create tags, each with a color.
- The pre-created tags `default`, `habit` and `goal` can be recolored but not renamed or deleted.

### Privacy and the timeline

- Every event type has `privacy` (`public` | `connections` | `private`) and `shareToTimeline` (yes/no).
- **Defaults**: privacy `connections`, shareToTimeline yes. Each user can change these defaults in settings.
- **Timeline**: shows the user's and their connections' events, with timestamps, and never strangers'.

  | privacy | shareToTimeline | Timeline shows | Diary visible to |
  |---|---|---|---|
  | public | yes | "ar1tra settled a task: add rate limiter" | everyone |
  | connections | yes | full text | connections |
  | private | yes | "ar1tra settled a task" | only the user |
  | public | no | — | everyone |
  | connections | no | — | connections |
  | private | no | — | only the user |

- The timeline can be **minimized**, and it has an **only mine** toggle.

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

- `/now`, `/tasks`, `/habits`, `/goals`, `/notes`, `/sessions`, `/diary`, `/inbox` and `/settings`.
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
| 14 | Visibility module and timeline on `/now` | 12, 13 |
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

- [ ] 1 Domain foundation
- [ ] 2 App shell and design system
- [ ] 3 Tasks backend
- [ ] 4 Tasks UI
- [ ] 5 Habits backend
- [ ] 6 Habits UI
- [ ] 7 Goals backend
- [ ] 8 Goals UI
- [ ] 9 Notes
- [ ] 10 Sessions backend
- [ ] 11 Sessions UI
- [ ] 12 Upcoming and day navigation
- [ ] 13 Profiles and connections
- [ ] 14 Visibility and timeline
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
