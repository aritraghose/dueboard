import { describe, expect, test } from "bun:test";
import {
  clampValue,
  completionChange,
  convertProgress,
  dayProgressAction,
  deltaError,
  goalPercent,
  goalValue,
  isReached,
  linkedDelta,
  valueError,
  withValue,
  type GoalProgress,
} from "./goal-rules.ts";
import { GOAL_COUNT_MAX } from "./model.ts";

const slider = (percent: number): GoalProgress => ({
  progressMode: "slider",
  progressPercent: percent,
  targetCount: null,
  currentCount: null,
});
const count = (current: number, target: number): GoalProgress => {
  const goal = { progressMode: "count" as const, progressPercent: 0, targetCount: target, currentCount: current };
  return { ...goal, progressPercent: goalPercent(goal) };
};

describe("goalPercent", () => {
  test("is the slider's own percent", () => {
    expect(goalPercent(slider(0))).toBe(0);
    expect(goalPercent(slider(42.5))).toBe(42.5);
    expect(goalPercent(slider(100))).toBe(100);
  });

  test("derives a count's percent, rounded down to two decimals", () => {
    expect(goalPercent(count(0, 250))).toBe(0);
    expect(goalPercent(count(7, 20))).toBe(35);
    expect(goalPercent(count(1, 3))).toBe(33.33);
    expect(goalPercent(count(2, 3))).toBe(66.66);
    expect(goalPercent(count(250, 250))).toBe(100);
  });

  test("reads 100 only once the target is reached", () => {
    expect(goalPercent(count(999_999, 1_000_000))).toBe(99.99);
    expect(goalPercent(count(249, 250))).toBe(99.6);
  });

  test("stays at 100 past the target", () => {
    expect(goalPercent(count(300, 250))).toBe(100);
  });
});

describe("isReached and goalValue", () => {
  test("a slider is reached at 100", () => {
    expect(isReached(slider(99.99))).toBe(false);
    expect(isReached(slider(100))).toBe(true);
    expect(goalValue(slider(40))).toBe(40);
  });

  test("a count is reached at or past its target", () => {
    expect(isReached(count(249, 250))).toBe(false);
    expect(isReached(count(250, 250))).toBe(true);
    expect(isReached(count(251, 250))).toBe(true);
    expect(goalValue(count(12, 250))).toBe(12);
  });
});

describe("clampValue and withValue", () => {
  test("keeps a slider within 0–100 at two decimals", () => {
    expect(clampValue("slider", -5)).toBe(0);
    expect(clampValue("slider", 120)).toBe(100);
    expect(clampValue("slider", 33.333)).toBe(33.33);
  });

  test("keeps a count whole and within 0–max", () => {
    expect(clampValue("count", -3)).toBe(0);
    expect(clampValue("count", GOAL_COUNT_MAX + 5)).toBe(GOAL_COUNT_MAX);
  });

  test("withValue derives the count's percent again", () => {
    const next = withValue(count(10, 20), 15);
    expect(next.currentCount).toBe(15);
    expect(next.progressPercent).toBe(75);
    expect(withValue(count(10, 20), -4).currentCount).toBe(0);
    expect(withValue(slider(10), 55).progressPercent).toBe(55);
  });

  test("a count can pass its target", () => {
    const next = withValue(count(250, 250), 251);
    expect(next.currentCount).toBe(251);
    expect(next.progressPercent).toBe(100);
  });
});

describe("valueError and deltaError", () => {
  test("a slider takes 0–100 with decimals", () => {
    expect(valueError("slider", 0)).toBeNull();
    expect(valueError("slider", 62.5)).toBeNull();
    expect(valueError("slider", 100.01)).toBeString();
  });

  test("a count takes whole numbers, past the target too", () => {
    expect(valueError("count", 300)).toBeNull();
    expect(valueError("count", 1.5)).toBeString();
  });

  test("a change can't be zero, and a count moves by whole numbers", () => {
    expect(deltaError("slider", 0)).toBeString();
    expect(deltaError("slider", -2.5)).toBeNull();
    expect(deltaError("count", 3)).toBeNull();
    expect(deltaError("count", 0.5)).toBeString();
  });
});

describe("convertProgress", () => {
  test("a count becomes its percent", () => {
    expect(convertProgress(count(7, 20), "slider", null)).toEqual(slider(35));
    expect(convertProgress(count(300, 250), "slider", null)).toEqual(slider(100));
  });

  test("a percent becomes that share of the target, rounded down", () => {
    expect(convertProgress(slider(35), "count", 20)).toEqual(count(7, 20));
    expect(convertProgress(slider(99.9), "count", 3)).toEqual(count(2, 3));
    expect(convertProgress(slider(100), "count", 3)).toEqual(count(3, 3));
  });

  test("a new target keeps the count", () => {
    expect(convertProgress(count(7, 20), "count", 10)).toEqual(count(7, 10));
    expect(convertProgress(count(7, 20), "count", null)).toEqual(count(7, 20));
  });

  test("never turns an unreached goal into a reached one", () => {
    for (const percent of [0, 1, 33.33, 50, 99.99]) {
      for (const target of [1, 2, 3, 7, 250, GOAL_COUNT_MAX]) {
        expect(isReached(convertProgress(slider(percent), "count", target))).toBe(false);
      }
    }
  });
});

describe("completionChange", () => {
  test("reaching the target completes an active or paused goal", () => {
    expect(completionChange("active", false, true)).toBe("complete");
    expect(completionChange("paused", false, true)).toBe("complete");
  });

  test("dropping below it reopens a completed goal", () => {
    expect(completionChange("completed", true, false)).toBe("reopen");
  });

  test("moving above the target, or below it, changes nothing else", () => {
    expect(completionChange("completed", true, true)).toBeNull();
    expect(completionChange("active", false, false)).toBeNull();
    expect(completionChange("paused", false, false)).toBeNull();
  });

  test("a goal reopened at its target stays open until it reaches it again", () => {
    expect(completionChange("active", true, true)).toBeNull();
    expect(completionChange("active", true, false)).toBeNull();
  });
});

describe("linkedDelta", () => {
  test("a tap or settle adds the amount", () => {
    expect(linkedDelta(1, 1, 0)).toBe(1);
    expect(linkedDelta(5, 1, 10)).toBe(5);
  });

  test("an undo takes back the amount", () => {
    expect(linkedDelta(1, -1, 3)).toBe(-1);
    expect(linkedDelta(5, -1, 5)).toBe(-5);
  });

  test("an undo never takes back more than was added", () => {
    expect(linkedDelta(1, -1, 0)).toBe(0);
    expect(linkedDelta(3, -1, 1)).toBe(-1);
    expect(linkedDelta(2, -1, -1)).toBe(0);
  });
});

describe("dayProgressAction", () => {
  test("the day's first change adds the row", () => {
    expect(dayProgressAction(null, 5)).toBe("insert");
  });

  test("later changes update it", () => {
    expect(dayProgressAction(3, 5)).toBe("update");
  });

  test("changes that cancel out remove it", () => {
    expect(dayProgressAction(3, 3)).toBe("delete");
  });
});
