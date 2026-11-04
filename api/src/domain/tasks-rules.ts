import type { LocalDate } from "./dates.ts";
import type { TaskDateRole, TaskStatus } from "./model.ts";

interface TaskDates {
  readonly assignedDate: LocalDate | null;
  readonly deadlineDate: LocalDate | null;
}

export const taskDatesError = ({ assignedDate, deadlineDate }: TaskDates): string | null =>
  assignedDate !== null && deadlineDate !== null && assignedDate > deadlineDate
    ? "The assigned date can't be after the deadline."
    : null;

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

export const dayBucketOn = (
  task: TaskDates & { readonly status: TaskStatus },
  day: LocalDate,
): DayBucket | null =>
  dateRoleOn(task, day) === null ? null : task.status === "settled" ? "settled" : "open";

export const isUnscheduled = ({ assignedDate, deadlineDate }: TaskDates): boolean =>
  assignedDate === null && deadlineDate === null;

export const mergePatch = <T extends object>(current: T, patch: Partial<T>): T => {
  const merged = { ...current };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value as T[keyof T];
  }
  return merged;
};

export type StatusTransition = "settle" | "unsettle" | "relabel" | "unchanged";

export const statusTransition = (from: TaskStatus, to: TaskStatus): StatusTransition => {
  if (from === to) return "unchanged";
  if (to === "settled") return "settle";
  if (from === "settled") return "unsettle";
  return "relabel";
};

export interface TaskCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export const encodeTaskCursor = ({ createdAt, id }: TaskCursor): string =>
  `${createdAt.toISOString()}|${id}`;

export const decodeTaskCursor = (cursor: string): TaskCursor | null => {
  const at = cursor.indexOf("|");
  if (at <= 0 || at === cursor.length - 1) return null;
  const createdAt = new Date(cursor.slice(0, at));
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id: cursor.slice(at + 1) };
};

export const titleSearchPattern = (query: string): string | null => {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
};
