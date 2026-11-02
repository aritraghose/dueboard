import type { LocalDate } from "./dates.ts";
import type { TaskDateRole, TaskStatus } from "./model.ts";

// Pure task rules, shared by `tasks.ts` and its tests. No I/O.

interface TaskDates {
  readonly assignedDate: LocalDate | null;
  readonly deadlineDate: LocalDate | null;
}

/**
 * Why a task's dates are invalid, or `null` when they're fine: the assigned
 * date can't be after the deadline. `LocalDate`s compare as strings.
 */
export const taskDatesError = ({ assignedDate, deadlineDate }: TaskDates): string | null =>
  assignedDate !== null && deadlineDate !== null && assignedDate > deadlineDate
    ? "The assigned date can't be after the deadline."
    : null;

/** Which of the task's dates fall on `day`, or `null` when it doesn't appear that day. */
export const dateRoleOn = (
  { assignedDate, deadlineDate }: TaskDates,
  day: LocalDate,
): TaskDateRole | null => {
  const assigned = assignedDate === day;
  const deadline = deadlineDate === day;
  if (assigned && deadline) return "both";
  if (assigned) return "assigned";
  if (deadline) return "deadline";
  return null;
};

export type DayBucket = "open" | "settled";

/**
 * Where a task shows on `day`: `open` or `settled`, or `null` when it isn't
 * on that day. A task settled before its deadline day shows as settled there.
 */
export const dayBucketOn = (
  task: TaskDates & { readonly status: TaskStatus },
  day: LocalDate,
): DayBucket | null =>
  dateRoleOn(task, day) === null ? null : task.status === "settled" ? "settled" : "open";

/** Whether the task has no dates (the "Unscheduled" section). */
export const isUnscheduled = ({ assignedDate, deadlineDate }: TaskDates): boolean =>
  assignedDate === null && deadlineDate === null;

/**
 * `current` with `patch` applied: a key that's present (even as `null`)
 * replaces the value, and a missing key keeps it. `undefined` counts as
 * missing, so a stray `{ title: undefined }` never clears a field.
 */
export const mergePatch = <T extends object>(current: T, patch: Partial<T>): T => {
  const merged = { ...current };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value as T[keyof T];
  }
  return merged;
};

/** What a status change does to `settled_at` and the `task_settled` activity. */
export type StatusTransition = "settle" | "unsettle" | "relabel" | "unchanged";

export const statusTransition = (from: TaskStatus, to: TaskStatus): StatusTransition => {
  if (from === to) return "unchanged";
  if (to === "settled") return "settle";
  if (from === "settled") return "unsettle";
  return "relabel";
};

// ─── Pagination and search ───────────────────────────────────────────────────

export interface TaskCursor {
  readonly createdAt: Date;
  readonly id: string;
}

/** `ListTasks` pages newest first by `(created_at, id)`; the cursor is the last row's pair. */
export const encodeTaskCursor = ({ createdAt, id }: TaskCursor): string =>
  `${createdAt.toISOString()}|${id}`;

/** The cursor's pair, or `null` when it's malformed. */
export const decodeTaskCursor = (cursor: string): TaskCursor | null => {
  const at = cursor.indexOf("|");
  if (at <= 0 || at === cursor.length - 1) return null;
  const createdAt = new Date(cursor.slice(0, at));
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: cursor.slice(at + 1) };
};

/**
 * An `ILIKE` pattern matching titles that contain `query` literally, or
 * `null` for a blank query. `%`, `_` and `\` are escaped (Postgres' default
 * escape character is `\`).
 */
export const titleSearchPattern = (query: string): string | null => {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
};
