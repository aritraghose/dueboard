# Prompt 8: Goals UI and linking

You are building step 8 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Goals) and `notes/architecture.md`.
Steps 1–7 should be ticked in Status. If they aren't, stop and tell me.

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

Goals on `/now`, the `/goals` page, and linking habits and tasks to goals from both sides.

## Read first

- The step 7 RPCs and decisions in `notes/planning.md`'s Decision log.
- The task and habit UI from steps 4 and 6.

## Build

### 1. Goals section on `/now`

- Each active goal shows:
  - name
  - progress: a percentage bar, plus "142 / 250" for count goals
  - target date, if set (with "N days left")
- Slider goals can be adjusted inline, with a debounced save.
- Count goals get a quick "+1" control.
- A goal completed on the selected day shows as completed. This is a good place for a small celebration, respecting reduced motion.
- Paused goals are hidden from `/now`.

### 2. Goal create and edit

- Fields:
  - name
  - description
  - mode: slider, or count with a target
  - target date
  - privacy and shareToLive (defaults from settings)
- **Links panel** (count goals):
  - Add linked habits and tasks through a searchable picker.
  - Set the amount per check-in or task.
  - Remove links.

### 3. From the other side

- The habit form and task card show "Moves goal: …".
- They can link to an existing goal, or create one inline (count mode).

### 4. `/goals` page

- Active, paused and completed groups.
- Each goal has:
  - its progress
  - linked items
  - a small progress-over-time line built from `goal_progress_events` (plain SVG, no chart dependency)
  - pause, resume, reopen and delete actions

## Acceptance

- [ ] The LeetCode example works end to end: create the goal (250), link the "5 a day" habit at +1, and tapping the habit on `/now` moves the goal.
- [ ] Linking works from the goal, the habit and the task side.
- [ ] Completed and reopened states display correctly.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## When done

- Tick step 8 in Status.
- Log decisions.
- Summarize.
