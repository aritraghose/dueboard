import { describe, expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import type { LocalDate } from "./dates.ts";
import { ExtendSessionInput, SESSION_LABEL_MAX_LENGTH, StartSessionInput } from "./model.ts";
import {
  canApply,
  computeEndsAt,
  elapsed,
  elapsedByDay,
  extendError,
  focusedMinutes,
  isExpired,
  remaining,
  transitionError,
  type Segment,
} from "./session-rules.ts";

const at = (time: string) => new Date(`2026-11-03T${time}Z`);
const seg = (start: string, end: string | null): Segment => ({
  startedAt: at(start),
  endedAt: end === null ? null : at(end),
});
const MIN = 60_000;

describe("elapsed", () => {
  test("sums closed segments and the open one up to now", () => {
    expect(elapsed([], at("10:00:00"))).toBe(0);
    expect(elapsed([seg("10:00:00", "10:10:00")], at("11:00:00"))).toBe(10 * MIN);
    expect(
      elapsed([seg("10:00:00", "10:10:00"), seg("10:20:00", null)], at("10:25:00")),
    ).toBe(15 * MIN);
  });

  test("never counts an open segment that starts after now", () => {
    expect(elapsed([seg("10:20:00", null)], at("10:10:00"))).toBe(0);
  });
});

describe("remaining and computeEndsAt", () => {
  test("a fresh running session ends after its planned minutes", () => {
    const segments = [seg("10:00:00", null)];
    expect(remaining(25, segments, at("10:00:00"))).toBe(25 * MIN);
    expect(computeEndsAt(25, segments, at("10:00:00"))).toEqual(at("10:25:00"));
  });

  test("ends_at doesn't drift with the moment it's computed while running", () => {
    const segments = [seg("10:00:00", null)];
    expect(computeEndsAt(25, segments, at("10:07:13"))).toEqual(at("10:25:00"));
  });

  test("pause then resume pushes ends_at back by the pause", () => {
    const resumed = [seg("10:00:00", "10:10:00"), seg("10:30:00", null)];
    expect(remaining(25, resumed, at("10:30:00"))).toBe(15 * MIN);
    expect(computeEndsAt(25, resumed, at("10:30:00"))).toEqual(at("10:45:00"));
  });

  test("while paused the remaining time holds still", () => {
    const paused = [seg("10:00:00", "10:10:00")];
    expect(remaining(25, paused, at("10:30:00"))).toBe(15 * MIN);
    expect(remaining(25, paused, at("12:00:00"))).toBe(15 * MIN);
  });

  test("extending adds to ends_at, running or paused", () => {
    const running = [seg("10:00:00", null)];
    expect(computeEndsAt(25 + 10, running, at("10:20:00"))).toEqual(at("10:35:00"));
    const paused = [seg("10:00:00", "10:10:00")];
    expect(remaining(25 + 10, paused, at("10:40:00"))).toBe(25 * MIN);
  });

  test("never goes below zero", () => {
    expect(remaining(25, [seg("10:00:00", null)], at("11:00:00"))).toBe(0);
    expect(computeEndsAt(25, [seg("10:00:00", null)], at("11:00:00"))).toEqual(at("11:00:00"));
  });
});

describe("isExpired", () => {
  test("only a running session at or past ends_at", () => {
    expect(isExpired({ status: "running", endsAt: at("10:25:00") }, at("10:24:59"))).toBe(false);
    expect(isExpired({ status: "running", endsAt: at("10:25:00") }, at("10:25:00"))).toBe(true);
    expect(isExpired({ status: "paused", endsAt: null }, at("23:00:00"))).toBe(false);
    expect(isExpired({ status: "completed", endsAt: null }, at("23:00:00"))).toBe(false);
  });
});

describe("transitions", () => {
  test("pause only running, resume only paused", () => {
    expect(canApply("running", "pause")).toBe(true);
    expect(canApply("paused", "pause")).toBe(false);
    expect(canApply("paused", "resume")).toBe(true);
    expect(canApply("running", "resume")).toBe(false);
  });

  test("extend and stop only while active", () => {
    for (const action of ["extend", "stop"] as const) {
      expect(canApply("running", action)).toBe(true);
      expect(canApply("paused", action)).toBe(true);
      expect(canApply("completed", action)).toBe(false);
      expect(canApply("stopped", action)).toBe(false);
    }
  });

  test("ended sessions take nothing", () => {
    for (const action of ["pause", "resume", "extend", "stop"] as const) {
      expect(transitionError("completed", action)).toBe("This session has already ended.");
      expect(transitionError("stopped", action)).toBe("This session has already ended.");
    }
  });

  test("explains a repeated pause or resume", () => {
    expect(transitionError("paused", "pause")).toBe("This session is already paused.");
    expect(transitionError("running", "resume")).toBe("This session is already running.");
    expect(transitionError("running", "pause")).toBeNull();
  });
});

describe("extendError", () => {
  test("keeps the total within 600 minutes", () => {
    expect(extendError(590, 10)).toBeNull();
    expect(extendError(590, 11)).not.toBeNull();
  });
});

describe("focused minutes", () => {
  test("rounds down", () => {
    expect(focusedMinutes(0)).toBe(0);
    expect(focusedMinutes(MIN - 1)).toBe(0);
    expect(focusedMinutes(25 * MIN + 59_999)).toBe(25);
  });

  test("totals per day", () => {
    const d = (value: string) => value as LocalDate;
    const totals = elapsedByDay(
      [
        { localDate: d("2026-11-03"), segments: [seg("10:00:00", "10:25:00")] },
        { localDate: d("2026-11-03"), segments: [seg("11:00:00", null)] },
        { localDate: d("2026-11-02"), segments: [] },
      ],
      at("11:05:00"),
    );
    expect(totals.get(d("2026-11-03"))).toBe(30 * MIN);
    expect(totals.get(d("2026-11-02"))).toBe(0);
  });
});

describe("inputs", () => {
  const start = (input: unknown) => Schema.is(StartSessionInput)(input);

  test("minutes are whole, 1–600", () => {
    expect(start({ minutes: 1 })).toBe(true);
    expect(start({ minutes: 600 })).toBe(true);
    expect(start({ minutes: 0 })).toBe(false);
    expect(start({ minutes: 601 })).toBe(false);
    expect(start({ minutes: 2.5 })).toBe(false);
    expect(Schema.is(ExtendSessionInput)({ id: "a", minutes: 0 })).toBe(false);
  });

  test("labels are trimmed, one line, at most 100", () => {
    expect(start({ minutes: 25, label: "x".repeat(SESSION_LABEL_MAX_LENGTH) })).toBe(true);
    expect(start({ minutes: 25, label: "x".repeat(SESSION_LABEL_MAX_LENGTH + 1) })).toBe(false);
    expect(start({ minutes: 25, label: "" })).toBe(false);
    expect(start({ minutes: 25, label: " deep work" })).toBe(false);
    expect(start({ minutes: 25, label: "deep\nwork" })).toBe(false);
  });
});
