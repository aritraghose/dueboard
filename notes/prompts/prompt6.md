# Prompt 6: Habits UI

You are building step 6 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Habits, `/now`) and `notes/architecture.md`.
Steps 1–5 should be ticked in Status. If they aren't, stop and tell me.

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

Make habits feel great to check off: on `/now`, a schedule builder for creating
and editing, and the `/habits` page.

## Read first

- The step 5 RPCs and `describeSchedule`.
- The `/now` layout (step 2) and the task components (step 4), for consistency.

## Build

### 1. Habits section on `/now`, for the selected date

- **Habit cards for due habits**:
  - **Tapping the card adds a check-in.**
  - A progress ring or segments shows `done/target` (for example 3/5).
  - For flexible habits, a hint like "2 of 3 this week".
  - Undo is easy, through a small undo action and a toast with "Undo".
- **When every due habit is complete**: show an **"All habits checked"** state with a single celebratory moment, which must respect reduced motion.
- **Settled list**: completed habits move into a Settled list in the section, showing that day's completed habits.
- Habits carry the `habit` tag's color.
- **Past dates** can be checked in up to 30 days back, matching the API. **Future dates** are read-only, showing what will be due.

### 2. Create and edit habit

- **Fields**: title, description, schedule, start date (default today), privacy, shareToTimeline. Defaults come from settings.
- **Schedule builder**, with presets first:
  - Daily
  - N times a day
  - N times a week
  - Every N days
  - Specific weekdays
  - Monthly on specific days
  - N times a month
  - Custom (flexible, with any `period_length` and `period_unit`)
- It always shows a live sentence preview from the same rules as `describeSchedule`. You can mirror the function on the client by importing it from the api package if the build allows, or copy its logic into a shared module.

### 3. `/habits` page

- Every habit with:
  - its schedule sentence
  - current streak
  - status (active / paused / archived)
  - a small check-in heatmap of the last ~12 weeks (build it with plain elements, no chart dependency)
- Pause, resume, archive and delete, with confirmation for delete.
- Edit opens the same form.
- Filters: active / paused / archived.

## Acceptance

- [ ] "5 per day" takes 5 taps, and undo works.
- [ ] A weekly habit shows all week until done.
- [ ] Pausing hides the habit from `/now`.
- [ ] "All habits checked" appears when appropriate.
- [ ] Schedule previews read naturally.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## Out of scope

- Goal linking (step 8).

## When done

- Tick step 6 in Status.
- Log decisions.
- Summarize.
