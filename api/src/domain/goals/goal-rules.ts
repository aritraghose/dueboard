import { GOAL_COUNT_MAX, type GoalProgressMode, type GoalStatus } from "./model.ts";

export interface GoalProgress {
  readonly progressMode: GoalProgressMode;
  readonly progressPercent: number;
  readonly targetCount: number | null;
  readonly currentCount: number | null;
}

const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

export const goalPercent = (goal: GoalProgress): number => {
  if (goal.progressMode === "slider") return goal.progressPercent;
  const current = goal.currentCount ?? 0;
  const target = goal.targetCount ?? 1;
  if (current >= target) return 100;
  return Math.floor((current * 10_000) / target) / 100;
};

export const isReached = (goal: GoalProgress): boolean =>
  goal.progressMode === "slider"
    ? goal.progressPercent >= 100
    : (goal.currentCount ?? 0) >= (goal.targetCount ?? 1);

export const goalValue = (goal: GoalProgress): number =>
  goal.progressMode === "slider" ? goal.progressPercent : (goal.currentCount ?? 0);

export const clampValue = (mode: GoalProgressMode, value: number): number =>
  mode === "slider"
    ? Math.min(100, Math.max(0, twoDecimals(value)))
    : Math.min(GOAL_COUNT_MAX, Math.max(0, Math.round(value)));

export const valueError = (mode: GoalProgressMode, value: number): string | null => {
  if (mode === "slider") return value > 100 ? "Progress is a percent from 0 to 100." : null;
  return Number.isInteger(value) ? null : "A count goal's progress is a whole number.";
};

export const deltaError = (mode: GoalProgressMode, delta: number): string | null => {
  if (delta === 0) return "The change can't be zero.";
  if (mode === "count" && !Number.isInteger(delta)) return "A count goal moves by whole numbers.";
  return null;
};

export const withValue = <G extends GoalProgress>(goal: G, value: number): G => {
  const clamped = clampValue(goal.progressMode, value);
  if (goal.progressMode === "slider") return { ...goal, progressPercent: clamped };
  const next = { ...goal, currentCount: clamped };
  return { ...next, progressPercent: goalPercent(next) };
};

export const convertProgress = (
  goal: GoalProgress,
  mode: GoalProgressMode,
  targetCount: number | null,
): GoalProgress => {
  if (mode === "slider") {
    return { progressMode: "slider", progressPercent: goalPercent(goal), targetCount: null, currentCount: null };
  }
  const target = targetCount ?? goal.targetCount ?? 1;
  const current =
    goal.progressMode === "count"
      ? (goal.currentCount ?? 0)
      : isReached(goal)
        ? target
        : Math.floor((goal.progressPercent * target) / 100);
  const next = { progressMode: "count" as const, progressPercent: 0, targetCount: target, currentCount: current };
  return { ...next, progressPercent: goalPercent(next) };
};

export const completionChange = (
  status: GoalStatus,
  wasReached: boolean,
  nowReached: boolean,
): "complete" | "reopen" | null => {
  if (status !== "completed" && !wasReached && nowReached) return "complete";
  if (status === "completed" && !nowReached) return "reopen";
  return null;
};

export const linkedDelta = (amount: number, direction: 1 | -1, added: number): number => {
  if (direction === 1) return amount;
  const back = Math.min(amount, Math.max(0, added));
  return back === 0 ? 0 : -back;
};

export const dayProgressAction = (
  existingValueBefore: number | null,
  valueAfter: number,
): "insert" | "update" | "delete" => {
  if (existingValueBefore === null) return "insert";
  return existingValueBefore === valueAfter ? "delete" : "update";
};
