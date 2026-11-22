import { addDays, daysBetween, startOfWeek, type LocalDate } from "./dates.ts";
import type { ActivityKind } from "./model.ts";

export const DIARY_KINDS = [
  "task_settled",
  "habit_completed",
  "goal_progressed",
  "goal_completed",
  "note_created",
  "session_completed",
  "session_stopped",
] as const satisfies readonly ActivityKind[];

export const GRAPH_KINDS = [
  "task_settled",
  "habit_completed",
  "goal_completed",
  "session_completed",
] as const satisfies readonly ActivityKind[];

export const GRAPH_WEEKS = 53;

export const DIARY_PAGE_DAYS = 7;
export const DIARY_PAGE_ENTRIES = 60;

export const graphRange = (
  today: LocalDate,
  from?: LocalDate,
  to?: LocalDate,
): { from: LocalDate; to: LocalDate } | null => {
  const end = to ?? today;
  const start = startOfWeek(from ?? addDays(startOfWeek(end), -(GRAPH_WEEKS - 1) * 7));
  const span = daysBetween(start, end);
  if (span < 0 || span >= GRAPH_WEEKS * 7) return null;
  return { from: start, to: end };
};

export const pickDiaryDays = (
  days: readonly { date: LocalDate; count: number }[],
): { dates: LocalDate[]; more: boolean } => {
  const dates: LocalDate[] = [];
  let entries = 0;
  for (const day of days) {
    if (dates.length === DIARY_PAGE_DAYS) break;
    if (dates.length > 0 && entries + day.count > DIARY_PAGE_ENTRIES) break;
    dates.push(day.date);
    entries += day.count;
  }
  return { dates, more: days.length > dates.length };
};
