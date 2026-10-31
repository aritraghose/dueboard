# Prompt 12: Upcoming view and day navigation polish

You are building step 12 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (`/now`) and `notes/architecture.md` ("What
shows on a given day"). Steps 1–11 should be ticked in Status. If they aren't,
stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Load the `frontend-design` skill.**
  - Follow the tokens in `web/src/styles.css`.
  - Use shadcn components.
  - No external assets.
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

`/now` becomes one fast, coherent day view for any date, plus an **Upcoming** view: tasks, habits and goals for coming dates, grouped by date.

## Build

### 1. Backend: aggregate reads

- **`GetDay(date)`**: one RPC returning everything `/now` needs for a date:
  - tasks (open, settled, plus unscheduled when the date is today)
  - habits (due, settled, allChecked)
  - goals
  - sessions
  - notes count

  It replaces the many per-section calls, which cuts round trips. Build it on the existing services, and run the queries in parallel where safe.
- **`GetUpcoming({ from, days })`**: for each date in `[from, from + days)` (cap at 60 days):
  - tasks assigned or due that day;
  - **habits scheduled that day** (project the rule engine forward; for flexible habits, show them on the period's first day as "N this week/period" so they don't repeat daily in the list);
  - goals with a `target_date` that day.

  Empty days are omitted.

### 2. `/now`

- Switch the sections to `GetDay`.
- Prefetch the previous and next days so ← → feels instant.
- **Past days** show what happened: settled tasks, completed habits, sessions.
- **Future days** show what's planned: future habits are read-only.

### 3. Upcoming view

- The "Upcoming" button opens it, either as a route (`/now/upcoming`) or a sheet; choose based on the layout and note the decision.
- Content is grouped by date with clear date headers ("Tomorrow", "Tue, Nov 3", …).
- Items open the same task card, habit editor and goal view.
- Paging is "Load more days".

### 4. Polish

- Loading skeletons.
- Each section gets a consistent empty state for today, past and future.
- Errors show inline.

## Acceptance

- [ ] `/now` loads a day with one aggregate request (plus prefetches).
- [ ] ← → feels instant.
- [ ] Upcoming lists the next weeks correctly, including weekly and specific-day habits and dated goals.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## When done

- Tick step 12 in Status.
- Log decisions.
- Summarize.
