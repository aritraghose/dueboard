import { GOAL_COUNT_MAX, type GoalProgressMode, type GoalStatus } from "./model.ts";

// Pure goal rules, shared by `goals.ts` and its tests. No I/O. Every
// percent anywhere comes from `goalPercent`.
//
// A goal's "value" is its own unit: the percent for a slider goal, the
// count for a count goal. Progress events and the `goal_progressed`
// activity store values in that unit.

/** The columns that make up a goal's progress. */
export interface GoalProgress {
  readonly progressMode: GoalProgressMode;
  readonly progressPercent: number;
  readonly targetCount: number | null;
  readonly currentCount: number | null;
}

/** Rounds to the two decimals `progress_percent` stores. */
const twoDecimals = (value: number): number => Math.round(value * 100) / 100;

/**
 * The goal's percent, 0–100 with two decimals. A count goal's percent is
 * rounded down, so it reads 100 only once the target is reached (999,999
 * of 1,000,000 is 99.99, not 100); a count past its target stays at 100.
 */
export const goalPercent = (goal: GoalProgress): number => {
  if (goal.progressMode === "slider") return goal.progressPercent;
  const current = goal.currentCount ?? 0;
  const target = goal.targetCount ?? 1;
  if (current >= target) return 100;
  return Math.floor((current * 10_000) / target) / 100;
};

/** Whether the goal is at its target: 100% for a slider, the target count for a count. */
export const isReached = (goal: GoalProgress): boolean =>
  goal.progressMode === "slider"
    ? goal.progressPercent >= 100
    : (goal.currentCount ?? 0) >= (goal.targetCount ?? 1);

/** The goal's value in its own unit. */
export const goalValue = (goal: GoalProgress): number =>
  goal.progressMode === "slider" ? goal.progressPercent : (goal.currentCount ?? 0);

/** `value` brought into the mode's range: 0–100 (two decimals) or a whole 0–1,000,000. */
export const clampValue = (mode: GoalProgressMode, value: number): number =>
  mode === "slider"
    ? Math.min(100, Math.max(0, twoDecimals(value)))
    : Math.min(GOAL_COUNT_MAX, Math.max(0, Math.round(value)));

/** Why `value` can't be set on a goal of `mode`, or `null` when it can. */
export const valueError = (mode: GoalProgressMode, value: number): string | null => {
  if (mode === "slider") return value > 100 ? "Progress is a percent from 0 to 100." : null;
  return Number.isInteger(value) ? null : "A count goal's progress is a whole number.";
};

/** Why `delta` can't move a goal of `mode`, or `null` when it can. */
export const deltaError = (mode: GoalProgressMode, delta: number): string | null => {
  if (delta === 0) return "The change can't be zero.";
  if (mode === "count" && !Number.isInteger(delta)) return "A count goal moves by whole numbers.";
  return null;
};

/** `goal` with its value set to `value` (clamped), and the percent derived again. */
export const withValue = <G extends GoalProgress>(goal: G, value: number): G => {
  const clamped = clampValue(goal.progressMode, value);
  if (goal.progressMode === "slider") return { ...goal, progressPercent: clamped };
  const next = { ...goal, currentCount: clamped };
  return { ...next, progressPercent: goalPercent(next) };
};

/**
 * The goal's progress in the other mode, carrying it over: a count becomes
 * its percent, and a percent becomes that share of `targetCount` (rounded
 * down, so a goal that wasn't reached doesn't become reached). Within the
 * same mode, `targetCount` changes the target and keeps the count.
 */
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

/**
 * What a progress change does to the status. Reaching the target (from
 * below) completes the goal, whatever its status; dropping below it
 * reopens a completed goal. A goal reopened while at its target stays
 * open until it drops below and reaches it again.
 */
export const completionChange = (
  status: GoalStatus,
  wasReached: boolean,
  nowReached: boolean,
): "complete" | "reopen" | null => {
  if (status !== "completed" && !wasReached && nowReached) return "complete";
  if (status === "completed" && !nowReached) return "reopen";
  return null;
};

/**
 * The change a linked habit tap or task settle makes: `+amount`, or for an
 * undo, `-amount` but never more than the item still has added (`added`, the
 * net of its earlier events for that habit day or task). So an undo of a tap
 * from before the link, or after the amount was raised, takes back only
 * what was actually added.
 */
export const linkedDelta = (amount: number, direction: 1 | -1, added: number): number => {
  if (direction === 1) return amount;
  const back = Math.min(amount, Math.max(0, added));
  return back === 0 ? 0 : -back;
};

/**
 * What to do with the day's `goal_progressed` row, which holds the value at
 * the day's first change (`valueBefore`) and the latest one: add it, update
 * it, or delete it when the day's changes cancel out (a tap and its undo).
 */
export const dayProgressAction = (
  existingValueBefore: number | null,
  valueAfter: number,
): "insert" | "update" | "delete" => {
  if (existingValueBefore === null) return "insert";
  return existingValueBefore === valueAfter ? "delete" : "update";
};
