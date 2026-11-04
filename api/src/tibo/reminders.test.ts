import { describe, expect, test } from "bun:test";
import { reminderInstant, reminderWhen } from "./reminders.ts";

const DHAKA = "Asia/Dhaka";
const now = Date.parse("2026-11-04T04:30:00Z");
const today = "2026-11-04";

describe("reminder times", () => {
  test("tomorrow at 8 PM, in the user's zone", () => {
    const when = reminderInstant({ date: "2026-11-05", time: "20:00" }, DHAKA, now, today);
    expect(when).toEqual({ at: Date.parse("2026-11-05T14:00:00Z") });
    expect(reminderWhen(Date.parse("2026-11-05T14:00:00Z"), DHAKA, today)).toBe("Tomorrow, 8:00 PM");
  });

  test("later today works; the past and bad times don't", () => {
    expect(reminderInstant({ date: today, time: "11:30" }, DHAKA, now, today)).toEqual({
      at: Date.parse("2026-11-04T05:30:00Z"),
    });
    expect(reminderInstant({ date: today, time: "09:00" }, DHAKA, now, today)).toHaveProperty("error");
    expect(reminderInstant({ date: today, time: "25:00" }, DHAKA, now, today)).toHaveProperty("error");
    expect(reminderInstant({ date: today, time: "8pm" }, DHAKA, now, today)).toHaveProperty("error");
  });

  test("at most a year ahead", () => {
    expect(reminderInstant({ date: "2027-11-04", time: "08:00" }, DHAKA, now, today)).toHaveProperty("at");
    expect(reminderInstant({ date: "2027-12-01", time: "08:00" }, DHAKA, now, today)).toHaveProperty("error");
  });
});
