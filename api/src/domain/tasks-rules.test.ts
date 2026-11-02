import { describe, expect, test } from "bun:test";
import type { LocalDate } from "./dates.ts";
import {
  dateRoleOn,
  dayBucketOn,
  decodeTaskCursor,
  encodeTaskCursor,
  isUnscheduled,
  mergePatch,
  statusTransition,
  taskDatesError,
  titleSearchPattern,
} from "./tasks-rules.ts";

const d = (value: string) => value as LocalDate;
const dates = (assigned: string | null, deadline: string | null) => ({
  assignedDate: assigned === null ? null : d(assigned),
  deadlineDate: deadline === null ? null : d(deadline),
});

describe("taskDatesError", () => {
  test("allows missing dates and assigned on or before the deadline", () => {
    expect(taskDatesError(dates(null, null))).toBeNull();
    expect(taskDatesError(dates("2026-11-05", null))).toBeNull();
    expect(taskDatesError(dates(null, "2026-11-05"))).toBeNull();
    expect(taskDatesError(dates("2026-11-05", "2026-11-05"))).toBeNull();
    expect(taskDatesError(dates("2026-11-04", "2026-11-05"))).toBeNull();
  });

  test("rejects an assigned date after the deadline", () => {
    expect(taskDatesError(dates("2026-11-06", "2026-11-05"))).toBeString();
    expect(taskDatesError(dates("2027-01-01", "2026-12-31"))).toBeString();
  });
});

describe("dateRoleOn", () => {
  const day = d("2026-11-02");

  test("names the dates that fall on the day", () => {
    expect(dateRoleOn(dates("2026-11-02", "2026-11-09"), day)).toBe("assigned");
    expect(dateRoleOn(dates("2026-10-30", "2026-11-02"), day)).toBe("deadline");
    expect(dateRoleOn(dates(null, "2026-11-02"), day)).toBe("deadline");
    expect(dateRoleOn(dates("2026-11-02", "2026-11-02"), day)).toBe("both");
  });

  test("is null on other days and for unscheduled tasks", () => {
    expect(dateRoleOn(dates("2026-11-01", "2026-11-03"), day)).toBeNull();
    expect(dateRoleOn(dates(null, null), day)).toBeNull();
  });
});

describe("dayBucketOn", () => {
  const day = d("2026-11-05");

  test("open tasks are open on both of their days", () => {
    const task = { ...dates("2026-11-01", "2026-11-05"), status: "working" as const };
    expect(dayBucketOn(task, d("2026-11-01"))).toBe("open");
    expect(dayBucketOn(task, day)).toBe("open");
    expect(dayBucketOn({ ...task, status: "idle" }, day)).toBe("open");
  });

  test("a task settled earlier shows as settled on its deadline day", () => {
    const task = { ...dates("2026-11-01", "2026-11-05"), status: "settled" as const };
    expect(dayBucketOn(task, day)).toBe("settled");
    expect(dayBucketOn(task, d("2026-11-01"))).toBe("settled");
  });

  test("is null between the dates (no carry-over)", () => {
    const task = { ...dates("2026-11-01", "2026-11-05"), status: "idle" as const };
    expect(dayBucketOn(task, d("2026-11-03"))).toBeNull();
    expect(dayBucketOn(task, d("2026-11-06"))).toBeNull();
  });
});

test("isUnscheduled", () => {
  expect(isUnscheduled(dates(null, null))).toBe(true);
  expect(isUnscheduled(dates("2026-11-01", null))).toBe(false);
  expect(isUnscheduled(dates(null, "2026-11-01"))).toBe(false);
});

describe("mergePatch", () => {
  const current = { title: "a", description: "x" as string | null, importance: 3 as number | null };

  test("a present key replaces, a missing key keeps", () => {
    expect(mergePatch(current, { title: "b" })).toEqual({ ...current, title: "b" });
    expect(mergePatch(current, {})).toEqual(current);
  });

  test("an explicit null clears", () => {
    expect(mergePatch(current, { description: null, importance: null })).toEqual({
      title: "a",
      description: null,
      importance: null,
    });
  });

  test("undefined counts as missing", () => {
    expect(mergePatch(current, { description: undefined })).toEqual(current);
  });

  test("doesn't mutate its inputs", () => {
    const patch = { title: "b" };
    mergePatch(current, patch);
    expect(current.title).toBe("a");
    expect(patch).toEqual({ title: "b" });
  });
});

describe("statusTransition", () => {
  test("settling and un-settling", () => {
    expect(statusTransition("idle", "settled")).toBe("settle");
    expect(statusTransition("working", "settled")).toBe("settle");
    expect(statusTransition("settled", "idle")).toBe("unsettle");
    expect(statusTransition("settled", "working")).toBe("unsettle");
  });

  test("relabels and no-ops", () => {
    expect(statusTransition("idle", "working")).toBe("relabel");
    expect(statusTransition("working", "idle")).toBe("relabel");
    expect(statusTransition("settled", "settled")).toBe("unchanged");
    expect(statusTransition("idle", "idle")).toBe("unchanged");
  });
});

describe("task cursors", () => {
  test("round-trip", () => {
    const cursor = {
      createdAt: new Date("2026-11-02T10:20:30.456Z"),
      id: "0b7f4e0a-3f7a-4a51-9a62-0c1d2e3f4a5b",
    };
    expect(decodeTaskCursor(encodeTaskCursor(cursor))).toEqual(cursor);
  });

  test("reject malformed cursors", () => {
    expect(decodeTaskCursor("")).toBeNull();
    expect(decodeTaskCursor("nope")).toBeNull();
    expect(decodeTaskCursor("|abc")).toBeNull();
    expect(decodeTaskCursor("2026-11-02T10:20:30.456Z|")).toBeNull();
    expect(decodeTaskCursor("not-a-date|abc")).toBeNull();
  });
});

describe("titleSearchPattern", () => {
  test("wraps the trimmed query", () => {
    expect(titleSearchPattern("  rate limiter ")).toBe("%rate limiter%");
  });

  test("escapes LIKE wildcards", () => {
    expect(titleSearchPattern("100%_done\\")).toBe("%100\\%\\_done\\\\%");
  });

  test("is null for a blank query", () => {
    expect(titleSearchPattern("")).toBeNull();
    expect(titleSearchPattern("   ")).toBeNull();
  });
});
