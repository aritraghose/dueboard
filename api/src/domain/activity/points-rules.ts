import { startOfMonth, startOfWeek, type LocalDate } from "./dates.ts";
import type { LeaderboardPeriod } from "./model.ts";

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
