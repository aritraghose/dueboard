import { startOfMonth, startOfWeek, type LocalDate } from "./dates.ts";
import type { LeaderboardPeriod } from "./model.ts";

// Points: +1 for each settled task, each habit checked on a day (one per
// habit and day, however many taps), each goal moved on a day (one per goal
// and day, the `goal_progressed` row) and each completed focus session.
// They're counted from the rows those already leave (`points.ts`), so an
// undo takes its point back and nothing can be farmed by tapping.

/** The first day a leaderboard period counts, in the viewer's zone; `null` for all time. */
export const periodStart = (period: LeaderboardPeriod, today: LocalDate): LocalDate | null => {
  switch (period) {
    case "all":
      return null;
    case "month":
      return startOfMonth(today);
    case "week":
      return startOfWeek(today);
    case "today":
      return today;
  }
};
