# Prompt 15: Diary and contribution graph

You are building step 15 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Diary, Profile) and `notes/architecture.md`
(§5 diary and contribution graph). Steps 1–14 should be ticked in Status. If
they aren't, stop and tell me.

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

1. A user's diary: their events grouped by day, filtered for whoever is viewing.
2. A GitHub-style contribution graph on the profile.

## Build

### 1. Backend

- **`GetDiary({ username, cursor })`**: activity grouped by the owner's `local_date`, newest day first, cursor-paginated by day.
  - Viewing your own diary shows everything.
  - Other viewers see only items allowed by `canSeeItem`, **whatever** `share_to_live` is. Use the step 14 SQL helpers.
  - It works for logged-out viewers, who see public items only, through the public read path from step 13.
- **Diary contents**:
  - settled tasks
  - completed habits
  - goal progress and completions
  - notes
  - completed and stopped sessions (with minutes)
- **`GetContributionGraph({ username, from?, to? })`**: counts per `local_date` for the last 53 weeks, aligned to Sunday-starting weeks.
  - **Counts**: `task_settled`, `habit_completed`, `goal_completed`, `session_completed`. **Private items are counted**, but no details are returned. `session_stopped` is excluded.
  - Visible to anyone who can see the profile.
  - If this query gets heavy, add an index or a small daily rollup table updated in the same transactions. Explain the choice.

### 2. UI

- **`/diary`**: your own diary.
  - Day headers ("Sun, Nov 1").
  - Under each day, events grouped by type, with times.
  - Infinite scroll or "Load more".
  - Jump to a date.
- **`/@username`**: fill in step 13's placeholders:
  - the contribution graph: a grid of squares with 4–5 intensity levels from the design tokens, month labels, tooltips ("5 things on Sun, Nov 1"), and keyboard focus;
  - the visible diary below it.
  - Build the graph with plain elements or SVG, with no chart dependency.
- Clicking a graph day scrolls or filters the diary to that day.

## Acceptance

- [ ] Your own diary shows everything.
- [ ] A connection sees public and connections items.
- [ ] A stranger or logged-out visitor sees public only.
- [ ] Graph counts include private items without revealing them.
- [ ] Stopped sessions aren't counted.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## When done

- Tick step 15 in Status.
- Log decisions.
- Summarize.
