import { addDays, daysBetween, startOfWeek, type LocalDate } from "./dates.ts";
import type { ActivityKind } from "./model.ts";

// Pure rules for the diary and the contribution graph (`diary.ts`,
// architecture.md §5).

/**
 * What a diary lists: settled tasks, completed habits, goal moves and
 * completions, notes, and sessions that ended either way. Session starts
 * and per-day habit taps (`habit_checked`) are left out.
 */
export const DIARY_KINDS = [
  "task_settled",
  "habit_completed",
  "goal_progressed",
  "goal_completed",
  "note_created",
  "session_completed",
  "session_stopped",
] as const satisfies readonly ActivityKind[];

/** What the contribution graph counts. Stopped sessions and goal moves don't. */
export const GRAPH_KINDS = [
  "task_settled",
  "habit_completed",
  "goal_completed",
  "session_completed",
] as const satisfies readonly ActivityKind[];

/** The graph's default span: this week and the 52 before it. */
export const GRAPH_WEEKS = 53;

/** A diary page holds at most this many days… */
export const DIARY_PAGE_DAYS = 7;
/** …and stops adding days once it holds this many entries (a busy day still comes whole). */
export const DIARY_PAGE_ENTRIES = 60;

/**
 * The days a graph covers: `to` defaults to the owner's today, and `from`
 * to the Sunday `GRAPH_WEEKS - 1` weeks before `to`'s week. A given `from`
 * is moved back to its Sunday so columns are whole weeks. `null` when `to`
 * is before `from` or the span is longer than `GRAPH_WEEKS` weeks.
 */
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

/**
 * Which of the newest days (with their entry counts, newest first) make one
 * page: at least one day, then more while the page stays within
 * `DIARY_PAGE_ENTRIES` and `DIARY_PAGE_DAYS`. `more` says older days remain.
 */
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
