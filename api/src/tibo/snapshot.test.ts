import { describe, expect, test } from "bun:test";
import { dayIn, dayLabel } from "./dates.ts";
import { todaySnapshot } from "./snapshot.ts";
import type { DayJson, SessionJson, TaskJson } from "./views.ts";

const task = (id: string, title: string, patch: Partial<TaskJson> = {}): TaskJson => ({
  id,
  title,
  description: null,
  assignedDate: "2026-11-04",
  deadlineDate: null,
  tagId: "tag",
  status: "idle",
  privacy: "private",
  importance: null,
  expectedMinutes: null,
  ...patch,
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

describe("todaySnapshot", () => {
  test("states the date, tasks with ids, habits, goals and the session", () => {
    const session: SessionJson = {
      id: "s1",
      label: "Deep work",
      plannedMinutes: 25,
      status: "running",
      startedAt: "2026-11-04T09:00:00.000Z",
      endsAt: "2026-11-04T09:25:00.000Z",
      elapsedMs: 10 * 60_000,
      remainingMs: 15 * 60_000,
    };
    const { body } = todaySnapshot({
      timeZone: "Asia/Kolkata",
      activeSession: session,
      day: day({
        tasks: {
          open: [{ task: task("t1", "Call mom", { importance: 4 }), role: "assigned" }],
          settled: [{ task: task("t2", "Gym", { status: "settled" }), role: "assigned" }],
        },
        habits: {
          due: [
            {
              habit: { id: "h1", title: "Read", status: "active", privacy: "private" },
              schedule: "Every day",
              date: "2026-11-04",
              status: "due",
              progress: { done: 0, target: 1, complete: false, periodStart: "2026-11-04", periodEnd: "2026-11-04" },
              countOnDay: 0,
              streak: 4,
            },
          ],
          settled: [],
          allChecked: false,
        },
        goals: {
          active: [
            {
              id: "g1",
              name: "Run 100 km",
              progressMode: "count",
              progressPercent: 42,
              targetCount: 100,
              currentCount: 42,
              targetDate: null,
              status: "active",
              privacy: "private",
            },
          ],
          completed: [],
        },
      }),
    });
    expect(body).toContain("Today is Wednesday 2026-11-04; tomorrow is 2026-11-05.");
    expect(body).toContain("- Call mom [id t1] (high importance)");
    expect(body).toContain("Done today: Gym.");
    expect(body).toContain("- Read [id h1] (Every day; 0/1 this period, streak 4)");
    expect(body).toContain("- Run 100 km [id g1] (42%, 42/100)");
    expect(body).toContain('Focus session: "Deep work" running, 15 min left of 25, ends 2:55 PM.');
  });

  test("long lists are cut, and an empty day stays short", () => {
    const open = Array.from({ length: 14 }, (_, i) => ({ task: task(`t${i}`, `Task ${i}`), role: "assigned" as const }));
    const { body } = todaySnapshot({ timeZone: "UTC", activeSession: null, day: day({ tasks: { open, settled: [] } }) });
    expect(body).toContain("- +4 more");
    expect(body).not.toContain("Task 12");
    const empty = todaySnapshot({ timeZone: "UTC", activeSession: null, day: day() }).body;
    expect(empty).toContain("Focus session: none running.");
    // Roughly 4 characters a token: well under the ~600-token budget.
    expect(body.length).toBeLessThan(2400);
  });
});

describe("dates", () => {
  test("the user's day and its labels", () => {
    expect(dayIn("Asia/Kolkata", new Date("2026-11-04T20:00:00Z"))).toBe("2026-11-05");
    expect(dayIn("America/Los_Angeles", new Date("2026-11-04T05:00:00Z"))).toBe("2026-11-03");
    expect(dayLabel("2026-11-05", "2026-11-04")).toBe("Tomorrow");
    expect(dayLabel("2026-11-06", "2026-11-04")).toBe("Fri, Nov 6");
    expect(dayLabel("2027-01-02", "2026-11-04")).toBe("Sat, Jan 2, 2027");
  });
});
