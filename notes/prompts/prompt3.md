# Prompt 3: Tasks backend

You are building step 3 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (especially Tasks) and
`notes/architecture.md` (§3, §4 tasks, §5 activity). Steps 1–2 should be ticked
in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

The complete tasks backend: schema, domain service, rules and RPCs. Step 4 builds the UI on top of it.

## Read first

- `api/src/domain/` from step 1: `database`, `dates`, `settings`, `tags`, `activity`.
- `api/src/schema.ts`, `api/src/rpc.ts`, `api/src/api.ts`.

## Build

### 1. Schema: `tasks`

| Column | Type and rules |
|---|---|
| `id` | primary key |
| `user_id` | text |
| `title` | 1–200 chars |
| `description` | nullable, ≤ 2000 |
| `assigned_date` | `date`, nullable |
| `deadline_date` | `date`, nullable |
| `tag_id` | not null |
| `status` | enum `idle`/`working`/`settled`, default `idle` |
| `settled_at` | timestamptz, nullable |
| `privacy` | enum |
| `share_to_live` | boolean |
| `importance` | smallint, nullable, `CHECK` 1–5 |
| `expected_minutes` | int, nullable, `CHECK` 1–1440 |
| `created_at`, `updated_at` | timestamps |

- `CHECK (assigned_date IS NULL OR deadline_date IS NULL OR assigned_date <= deadline_date)`.
- `settled_at` is set if and only if `status = settled` (`CHECK`).
- **Indexes**:
  - `(user_id, assigned_date)`
  - `(user_id, deadline_date)`
  - `(user_id, status)`
  - a partial index for unscheduled tasks (both dates null)

### 2. Domain service: `api/src/domain/tasks.ts`

- **`createTask`**:
  - Defaults: `tag_id` → the user's `default` tag; `privacy` and `share_to_live` → the user's settings defaults.
  - The tag must belong to the user.
- **`updateTask`**: a partial update.
  - An explicit `null` clears an optional field; a missing key leaves it unchanged.
  - Re-validate the dates rule against the merged values.
- **`setTaskStatus`**:
  - Going to `settled` sets `settled_at = now()` and records a `task_settled` activity.
  - Leaving `settled` clears `settled_at` and deletes that activity.
  - Do both in one transaction.
- **Goal hook**: add a clearly named seam (e.g. `onTaskSettled(tx, task)` and `onTaskUnsettled`, no-ops for now). Step 7 makes settling a goal-linked task add progress to the goal.
- **`deleteTask`**: also deletes its activity.
- **`getTask`**.
- **`listTasksForDay(date)`**: tasks where `assigned_date = date OR deadline_date = date`, split into:
  - `open`: not settled;
  - `settled`: settled (this covers "settled earlier, shows as settled on the deadline day").

  Each row includes which date roles apply (assigned, deadline or both), so the UI can show "Due today".
- **`listUnscheduledTasks`**: open tasks with no dates. Optionally include recently settled unscheduled tasks.
- **`listTasks`**: filters for status, tag, date range and text search on the title, with cursor pagination. Used by `/tasks`.
- **Tag deletion**: finish step 1's seam, so deleting a tag reassigns its tasks to the `default` tag in the same transaction.
- **Pure rules** go in `tasks-rules.ts` (date validation, which day bucket a task falls in), with `bun test` tests.

### 3. RPCs

`CreateTask`, `UpdateTask`, `SetTaskStatus`, `DeleteTask`, `GetTask`, `ListTasksForDay`, `ListUnscheduledTasks`, `ListTasks`.

- Typed errors: `NotFound`, `ValidationError` with a readable message.
- Schemas carry `maxLength`.
- Every query is scoped to `CurrentUser`.

### 4. Run it

Run `alchemy dev` once so the migration is generated.

## Acceptance

- [ ] Unit tests pass for the rules.
- [ ] The typecheck passes.
- [ ] The migration is generated.
- [ ] A quick manual check through the RPCs (or a temporary script) shows that:
  - settling and un-settling adds and removes activity;
  - the date rule is enforced;
  - another user's task can't be read or changed.

## Out of scope

- The UI (step 4).
- Goal links (step 7).
- Live (step 14).

## When done

- Tick step 3 in Status.
- Log decisions.
- Summarize the RPC shapes for step 4.
