# Prompt 7: Goals backend (with links from habits and tasks)

You are building step 7 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Goals) and `notes/architecture.md` (§4 goals,
`goal_links`, `goal_progress_events`, §5). Steps 1–6 should be ticked in Status.
If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Goals with real progress tracking, moved forward automatically by linked habits and tasks. The motivating example: the goal "Solve 250 LeetCode problems" is linked to the habit "5 problems a day" at +1 per tap.

## Goal model (decided)

- **`progress_mode`**:
  - `slider`: the user sets 0–100%.
  - `count`: `current_count` out of `target_count`. Percent is derived.
- Optional `target_date`.
- `status`: `active`, `paused` or `completed`.
- **Progress can go down.**
  - Reaching 100% (or the target count) sets `completed` and `completed_at`.
  - Dropping below that reopens the goal automatically.
  - An explicit "reopen" also exists.
- **Links**: a goal can link habits and tasks, each with an `amount` (default 1).
  - A habit check-in adds `amount` per tap, and an undo subtracts it.
  - Settling a task adds `amount`, and un-settling subtracts it.
  - Links only apply to **count** goals. A slider goal can't have links. Reject linking to a slider goal with a clear error, or convert it. Choose one and note the decision.
  - Paused goals still accept linked progress. Decide whether that's right and note the decision.
- **Display**: active goals show every day until completed. A goal completed on day D shows as completed on D.

## Build

### 1. Schema

- **`goals`**:
  - `id`, `user_id`, `name` (1–200), `description?`;
  - `progress_mode`, `progress_percent` (numeric 0–100), `target_count?`, `current_count?`;
  - `target_date?`;
  - `status`, `completed_at?`;
  - `privacy`, `share_to_live`;
  - timestamps.
  - `CHECK`s keep these consistent.
- **`goal_links`**: `id`, `goal_id`, `user_id`, `item_type` (`habit`|`task`), `item_id`, `amount` (> 0).
  - Unique `(goal_id, item_type, item_id)`.
- **`goal_progress_events`**: `id`, `goal_id`, `user_id`, `delta`, `value_after`, `source` (`manual`|`habit`|`task`), `source_id?`, `created_at`.

### 2. Service: `api/src/domain/goals.ts`

- **Basics**:
  - `createGoal`, `updateGoal` (name, description, target_date, privacy, share; switching mode only when there are no links);
  - `setProgress` (slider percent or count value), `adjustProgress(delta)`;
  - `pauseGoal`, `resumeGoal`, `reopenGoal`, `deleteGoal` (removes links and activity).
- **Linking**:
  - `linkItem` and `unlinkItem`.
  - The linked item must belong to the user.
- **Hook implementations** (fill the seams left in steps 3 and 5): `onTaskSettled` and `onTaskUnsettled` in tasks, `onHabitCheckIn(delta)` in habits.
  - They run inside the same transaction.
  - They write `goal_progress_events` and update completion.
- **Activity**:
  - **`goal_progressed`**: coalesce to **at most one row per goal per local day**. Update the day's existing row's `meta.value_after` and `occurred_at` instead of adding rows, so Live isn't spammed.
  - **`goal_completed`**: on completion. Delete it if the goal reopens.
- **Reads**:
  - `listGoalsForDay(date)`: active goals, plus any completed that day.
  - `listGoals`: filters, with links and recent progress events.
  - `getGoal`.
  - Everything percent-related comes from one pure function in `goal-rules.ts`, with tests.

### 3. RPCs

`CreateGoal`, `UpdateGoal`, `SetGoalProgress`, `AdjustGoalProgress`, `PauseGoal`, `ResumeGoal`, `ReopenGoal`, `DeleteGoal`, `LinkGoalItem`, `UnlinkGoalItem`, `ListGoalsForDay`, `ListGoals`, `GetGoal`.

- Also extend `GetTask` and `GetHabit`, or add a small RPC, to return which goals an item is linked to.

## Acceptance

- [ ] Rule tests pass.
- [ ] The typecheck passes.
- [ ] The migration is generated.
- [ ] Manual checks:
  - A habit check-in moves the linked count goal, and undo reverses it.
  - Settling and un-settling a linked task moves the goal.
  - Reaching the target completes the goal, and dropping below it reopens.
  - There is one `goal_progressed` row per day.

## Out of scope

- The UI (step 8).

## When done

- Tick step 7 in Status.
- Log decisions (slider and links, paused behavior).
- Summarize for step 8.
