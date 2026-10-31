# Prompt 5: Habits rule engine and backend

You are building step 5 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Habits) and `notes/architecture.md` (§4
habits and "What shows on a given day", §5). Steps 1–4 should be ticked in
Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Build a habit system flexible enough for users to define habits however they
like: a pure rule engine, thoroughly tested, plus the schema, service and RPCs.

## Habit model (decided)

A habit has a `target_count` and one of three schedule kinds:

- **Flexible**: `target_count` times per period, where the period is `period_length` × `period_unit` (`day` | `week` | `month`).
  - Examples: 3×/1 week, 2×/5 days, 10×/1 month, 1×/2 weeks.
  - Periods are anchored at `start_date`.
  - A 1-week period aligns to Sunday-starting weeks, and a 1-month period aligns to calendar months.
  - A multi-week or multi-day period is anchored at `start_date` (the first period starts there).
  - A flexible habit is **shown every day of its period** until the period's target is met. After that it counts as settled for the rest of the period.
- **Specific days**: `weekdays` (0 = Sun … 6 = Sat) or `month_days` (1–31). It's due only on those days, and `target_count` taps are needed **that day**.
  - A month day that doesn't exist in a given month (for example the 31st) falls on that month's **last day**.
- **Daily with a count**: flexible with `day` and length 1, target N (for example 5 LeetCode problems a day).

**Also**:
- Pauses (`habit_pauses`): a paused day is never due, and never breaks a streak.
- `status`: `active`, `paused` or `archived`.
- A habit is not due before its `start_date`.

**Streak**: the number of consecutive completed periods (flexible) or scheduled days (specific days), ending at the current one.
- The current period counts if it's already complete. If it isn't complete yet, it doesn't break the streak.
- Paused spans are skipped.

## Build

### 1. Schema

- **`habits`**:
  - `id`, `user_id`, `title` (1–200), `description?` (≤ 2000);
  - `schedule_kind`, `target_count` (1–100), `period_unit`, `period_length` (1–365);
  - `weekdays smallint[]?`, `month_days smallint[]?`;
  - `start_date`;
  - `status`, `privacy`, `share_to_timeline`;
  - timestamps.
- **`habit_pauses`**: `id`, `habit_id`, `start_date`, `end_date?`.
- **`habit_checkins`**: `id`, `habit_id`, `user_id`, `local_date`, `count`, `updated_at`.
  - Unique `(habit_id, local_date)`.
  - `CHECK count >= 0`.
- Indexes start with `user_id`.

### 2. Pure engine: `api/src/domain/habit-rules.ts`

- `periodFor(habit, date)` → `{ start, end }`
- `isScheduledOn(habit, pauses, date)`
- `progressFor(habit, checkins, date)` → `{ done, target, complete }` for the period or day containing `date`
- `dayStatus(...)` → `not_due` | `due` | `complete`
- `streak(habit, pauses, checkins, today)`
- `describeSchedule(habit)` → a readable sentence, such as "3 times a week" or "Every Mon, Wed, Fri" (used by both UI and Tibo)

**Tests (`bun test`)**: write extensive cases, including:
- Sunday week alignment
- 5-day periods anchored mid-month
- monthly periods and the 31st in February
- leap years
- pauses spanning period boundaries
- a habit starting today
- streak edge cases

### 3. Service: `api/src/domain/habits.ts`

- `createHabit`, `updateHabit`. Editing the rule keeps existing check-ins.
- `pauseHabit` and `resumeHabit` (open and close a pause row; set `status`).
- `archiveHabit`, `deleteHabit` (also deletes activity).
- **`checkIn(habitId, date)`** adds 1. **`undoCheckIn(habitId, date)`** subtracts 1.
  - Allowed for **today and past dates** (up to 30 days back). Not for future dates, and not for days the habit isn't due on.
  - When a check-in makes the period (or day) target reached, record **one** `habit_completed` activity. Store the period in `meta`.
  - When an undo drops it below the target, delete that activity.
  - Add goal hook seams `onHabitCheckIn(tx, habit, delta)` (no-op for now; step 7 implements them).
- **`listHabitsForDay(date)`**:
  - `due` (with progress);
  - `settled` (target already met this period or day);
  - `allChecked: boolean` (true when there is at least one due habit and all are complete).
- **`listHabits`**: all habits with their schedule description, current streak, status, and recent history (last ~12 weeks of check-ins, for a small heatmap).

### 4. RPCs

`CreateHabit`, `UpdateHabit`, `PauseHabit`, `ResumeHabit`, `ArchiveHabit`, `DeleteHabit`, `CheckInHabit`, `UndoCheckInHabit`, `ListHabitsForDay`, `ListHabits`, `GetHabit`.

## Acceptance

- [ ] The engine tests pass.
- [ ] The typecheck passes.
- [ ] The migration is generated.
- [ ] Manual RPC checks: a "5 per day" habit needs 5 check-ins. A "3× per week" habit shows all week until 3 are done. Pause hides it. Activity appears and disappears with target reached and undo.

## Out of scope

- The UI (step 6).
- Goal links (step 7).

## When done

- Tick step 5 in Status.
- Log decisions.
- Summarize the engine API for steps 6 and 7.
