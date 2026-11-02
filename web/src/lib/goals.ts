import { type Goal, type GoalLinkItem, goalPercent } from "@dueboard/api/rpc";
import { type LocalDate, daysBetween } from "@/lib/dates";

// Goals in words, and their progress with unsaved changes applied.

/** A goal with its value replaced (an unsaved +1 or slider move), the percent derived again. */
export function withShownValue(goal: Goal, value: number): Goal {
  if (goal.progressMode === "slider") return { ...goal, progressPercent: value } as Goal;
  const next = { ...goal, currentCount: value } as Goal;
  return { ...next, progressPercent: goalPercent(next) } as Goal;
}

/** "142 / 250" for a count goal, "35%" for a slider. */
export const progressText = (goal: Goal): string =>
  goal.progressMode === "count"
    ? `${(goal.currentCount ?? 0).toLocaleString("en-US")} / ${(goal.targetCount ?? 0).toLocaleString("en-US")}`
    : `${formatPercent(goal.progressPercent)}%`;

/** A percent without trailing zeros: 35, 35.5, 99.99. */
export const formatPercent = (percent: number): string => String(Math.round(percent * 100) / 100);

/** The percent shown beside a bar, whole: "<1" once started, never 100 before the target. */
export const roundPercent = (goal: Goal): string => {
  const percent = goalPercent(goal);
  if (percent > 0 && percent < 1) return "<1";
  return percent < 100 && Math.round(percent) === 100 ? "99" : String(Math.round(percent));
};

/** "12 days left", "Due today", "3 days past", from `today`. */
export function targetDateHint(targetDate: LocalDate, today: LocalDate): string {
  const days = daysBetween(today, targetDate);
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return days === -1 ? "1 day past" : `${-days} days past`;
}

/** "+1 per check-in", "+3 when settled". */
export const amountHint = (itemType: GoalLinkItem, amount: number): string =>
  itemType === "habit" ? `+${amount} per check-in` : `+${amount} when settled`;

/** One link in a goal's links panel, saved or not: a habit or task and what it adds. */
export type LinkDraft = {
  readonly itemType: GoalLinkItem;
  readonly itemId: string;
  readonly title: string;
  readonly amount: number;
};

/**
 * One goal a habit or task moves, in its card, saved or not. `goalId` is
 * `null` for a count goal to create along with the link (`name`, `targetCount`).
 */
export type ItemGoalDraft = {
  readonly key: string;
  readonly goalId: string | null;
  readonly name: string;
  readonly targetCount: number | null;
  readonly amount: number;
};
