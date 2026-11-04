import { type Goal, type GoalLinkItem, goalPercent } from "@dueboard/api/rpc";
import { type LocalDate, daysBetween } from "@/lib/dates";

export function withShownValue(goal: Goal, value: number): Goal {
  if (goal.progressMode === "slider") return { ...goal, progressPercent: value } as Goal;
  const next = { ...goal, currentCount: value } as Goal;
  return { ...next, progressPercent: goalPercent(next) } as Goal;
}

export const progressText = (goal: Goal): string =>
  goal.progressMode === "count"
    ? `${(goal.currentCount ?? 0).toLocaleString("en-US")} / ${(goal.targetCount ?? 0).toLocaleString("en-US")}`
    : `${formatPercent(goal.progressPercent)}%`;

export const formatPercent = (percent: number): string => String(Math.round(percent * 100) / 100);

export const roundPercent = (goal: Goal): string => {
  const percent = goalPercent(goal);
  if (percent > 0 && percent < 1) return "<1";
  return percent < 100 && Math.round(percent) === 100 ? "99" : String(Math.round(percent));
};

export function targetDateHint(targetDate: LocalDate, today: LocalDate): string {
  const days = daysBetween(today, targetDate);
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return days === -1 ? "1 day past" : `${-days} days past`;
}

export const amountHint = (itemType: GoalLinkItem, amount: number): string =>
  itemType === "habit" ? `+${amount} per check-in` : `+${amount} when settled`;

export type LinkDraft = {
  readonly itemType: GoalLinkItem;
  readonly itemId: string;
  readonly title: string;
  readonly amount: number;
};

export type ItemGoalDraft = {
  readonly key: string;
  readonly goalId: string | null;
  readonly name: string;
  readonly targetCount: number | null;
  readonly amount: number;
};
