import { describe, expect, test } from "bun:test";
import type { TiboProactiveSettings } from "../domain-client.ts";
import { instantIn } from "./dates.ts";
import {
  DORMANT_MS,
  QUIET_MS,
  STALE_MS,
  checkInFocus,
  clockLabel,
  gate,
  nextSlot,
  planFingerprint,
  slotStillPlanned,
  slotTime,
  type GateInput,
} from "./proactive-rules.ts";
import type { DayJson, HabitOnDayJson, TaskJson } from "./views.ts";

const settings = (patch: Partial<TiboProactiveSettings> = {}): TiboProactiveSettings => ({
  enabled: true,
  morningPlan: true,
  morningTime: "08:00",
  deadlineNudges: true,
  habitCheck: true,
  eveningTime: "20:00",
  ...patch,
});

const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("slots", () => {
  test("each timed kind has its time, and none while off", () => {
    expect(slotTime("morning_plan", settings({ morningTime: "07:30" }))).toBe("07:30");
    expect(slotTime("deadline_nudge", settings())).toBe("15:00");
    expect(slotTime("habit_check", settings({ eveningTime: "21:00" }))).toBe("21:00");
    expect(slotTime("habit_check", settings({ habitCheck: false }))).toBeNull();
    expect(slotTime("morning_plan", settings({ enabled: false }))).toBeNull();
  });

  test("the next slot is today while it's ahead, otherwise tomorrow, in the user's zone", () => {
    // 7:00 in New York (EST, UTC-5) on Nov 4.
    const now = at("2026-11-04T12:00:00Z");
    expect(nextSlot("morning_plan", NY, "08:00", now)).toEqual({
      kind: "morning_plan",
      day: "2026-11-04",
      at: at("2026-11-04T13:00:00Z"),
    });
    // 9:00 there: tomorrow.
    expect(nextSlot("morning_plan", NY, "08:00", at("2026-11-04T14:00:00Z")).day).toBe("2026-11-05");
  });

  test("a slot that just came due is kept within the grace, and moves on without it", () => {
    const slotAt = at("2026-11-04T13:00:00Z");
    expect(nextSlot("morning_plan", NY, "08:00", slotAt + 60_000, 2 * 60_000).day).toBe("2026-11-04");
    expect(nextSlot("morning_plan", NY, "08:00", slotAt).day).toBe("2026-11-05");
  });

  test("DST keeps the local time, not the instant", () => {
    // Clocks went back on Nov 1, 2026 in New York: 8:00 is 12:00Z before, 13:00Z after.
    expect(instantIn(NY, "2026-10-31", "08:00")).toBe(at("2026-10-31T12:00:00Z"));
    expect(nextSlot("morning_plan", NY, "08:00", at("2026-10-31T13:00:00Z"))).toMatchObject({
      day: "2026-11-01",
      at: at("2026-11-01T13:00:00Z"),
    });
  });

  test("a slot armed under other settings or another zone no longer counts", () => {
    const slot = nextSlot("morning_plan", NY, "08:00", at("2026-11-04T12:00:00Z"));
    expect(slotStillPlanned(slot, settings(), NY)).toBe(true);
    expect(slotStillPlanned(slot, settings({ morningTime: "09:00" }), NY)).toBe(false);
    expect(slotStillPlanned(slot, settings(), "Europe/London")).toBe(false);
    expect(slotStillPlanned(slot, settings({ morningPlan: false }), NY)).toBe(false);
    expect(planFingerprint(settings(), NY)).not.toBe(planFingerprint(settings(), "Europe/London"));
  });
});

describe("gate", () => {
  const now = at("2026-11-04T13:00:30Z");
  const input = (patch: Partial<GateInput> = {}): GateInput => ({
    kind: "morning_plan",
    settings: settings(),
    now,
    at: at("2026-11-04T13:00:00Z"),
    lastMessageAt: now - 5 * 60 * 60_000,
    busy: false,
    lastSeenAt: now - 60 * 60_000,
    ...patch,
  });

  test("goes when nothing stands in the way", () => {
    expect(gate(input())).toBeNull();
    expect(gate(input({ lastMessageAt: null }))).toBeNull();
  });

  test("the switches", () => {
    expect(gate(input({ settings: settings({ enabled: false }) }))).toBe("off");
    expect(gate(input({ settings: settings({ morningPlan: false }) }))).toBe("kind_off");
  });

  test("quiet while they're mid-conversation, and while a turn runs", () => {
    expect(gate(input({ lastMessageAt: now - QUIET_MS + 1000 }))).toBe("quiet");
    expect(gate(input({ lastMessageAt: now - QUIET_MS - 1000 }))).toBeNull();
    expect(gate(input({ busy: true }))).toBe("busy");
  });

  test("old alarms and events are never sent late", () => {
    expect(gate(input({ now: input().at + STALE_MS + 1 }))).toBe("stale");
    expect(gate(input({ now: input().at + STALE_MS - 1000, lastSeenAt: input().at }))).toBeNull();
  });

  test("timed check-ins pause for someone who stopped opening the app", () => {
    expect(gate(input({ lastSeenAt: now - DORMANT_MS - 1 }))).toBe("dormant");
    expect(gate(input({ lastSeenAt: null }))).toBe("dormant");
  });

});

describe("what's worth saying", () => {
  const task = (title: string): TaskJson => ({
    id: title,
    title,
    description: null,
    assignedDate: null,
    deadlineDate: "2026-11-04",
    tagId: "t",
    status: "idle",
    privacy: "private",
    importance: null,
    expectedMinutes: null,
  });
  const habit = (title: string, status: HabitOnDayJson["status"]): HabitOnDayJson => ({
    habit: { id: title, title, status: "active", privacy: "private" },
    schedule: "Every day",
    date: "2026-11-04",
    status,
    progress: { done: 0, target: 1, complete: false, periodStart: "2026-11-04", periodEnd: "2026-11-04" },
    countOnDay: 0,
    streak: 0,
  });
  const day = (patch: Partial<DayJson> = {}): DayJson => ({
    date: "2026-11-04",
    tasks: { open: [], settled: [] },
    unscheduled: { open: [], settled: [] },
    habits: { due: [], settled: [], allChecked: false },
    goals: { active: [], completed: [] },
    sessions: { focusedMinutes: 0, sessions: [] },
    notesCount: 0,
    ...patch,
  });

  test("an empty day says nothing", () => {
    for (const kind of ["morning_plan", "deadline_nudge", "habit_check"] as const) {
      expect(checkInFocus(kind, day())).toBeNull();
    }
    expect(checkInFocus("morning_plan", null)).toBeNull();
  });

  test("the morning plan names tasks and due habits", () => {
    const focus = checkInFocus(
      "morning_plan",
      day({ tasks: { open: [{ task: task("Report"), role: "assigned" }], settled: [] }, habits: { due: [habit("Run", "due")], settled: [], allChecked: false } }),
    );
    expect(focus?.items).toEqual(["Report", "Run"]);
  });

  test("the deadline nudge only counts tasks due today", () => {
    const tasks = {
      open: [
        { task: task("Planned"), role: "assigned" as const },
        { task: task("Due"), role: "deadline" as const },
        { task: task("Both"), role: "both" as const },
      ],
      settled: [],
    };
    expect(checkInFocus("deadline_nudge", day({ tasks }))?.items).toEqual(["Due", "Both"]);
    expect(checkInFocus("deadline_nudge", day({ tasks: { open: [tasks.open[0]!], settled: [] } }))).toBeNull();
  });

  test("the habit check only counts habits still due", () => {
    const habits = { due: [habit("Read", "due"), habit("Done", "complete")], settled: [], allChecked: false };
    expect(checkInFocus("habit_check", day({ habits }))?.items).toEqual(["Read"]);
  });

  test("clock labels", () => {
    expect(clockLabel("08:00")).toBe("8:00 AM");
    expect(clockLabel("12:00")).toBe("12:00 PM");
    expect(clockLabel("20:30")).toBe("8:30 PM");
  });
});
