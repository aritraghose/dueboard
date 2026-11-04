import type { TiboProactiveSettings } from "../domain-client.ts";
import { TIBO_DEADLINE_NUDGE_TIME } from "../domain/tibo-constants.ts";
import type { ContextSection } from "./context.ts";
import { addDays, dayIn, instantIn } from "./dates.ts";
import type { DayJson } from "./views.ts";

export const PROACTIVE_KINDS = ["morning_plan", "deadline_nudge", "habit_check"] as const;
export type ProactiveKind = (typeof PROACTIVE_KINDS)[number];
export const SCHEDULED_KINDS = PROACTIVE_KINDS;
export type ScheduledKind = ProactiveKind;

export const QUIET_MS = 10 * 60_000;
export const STALE_MS = 30 * 60_000;
export const PLAN_GRACE_MS = 2 * 60_000;
export const DORMANT_MS = 7 * 24 * 60 * 60_000;

export type SkipReason =
  | "off"
  | "kind_off"
  | "stale"
  | "dormant"
  | "busy"
  | "quiet"
  | "nothing"
  | "quota"
  | "failed";

export const slotTime = (kind: ScheduledKind, settings: TiboProactiveSettings): string | null => {
  if (!settings.enabled) return null;
  switch (kind) {
    case "morning_plan":
      return settings.morningPlan ? settings.morningTime : null;
    case "deadline_nudge":
      return settings.deadlineNudges ? TIBO_DEADLINE_NUDGE_TIME : null;
    case "habit_check":
      return settings.habitCheck ? settings.eveningTime : null;
  }
};

export const kindEnabled = (kind: ProactiveKind, settings: TiboProactiveSettings): boolean =>
  slotTime(kind, settings) !== null;

export interface ProactiveSlot {
  readonly kind: ScheduledKind;
  readonly at: number;
  readonly day: string;
  readonly dev?: true;
}

export const nextSlot = (
  kind: ScheduledKind,
  timeZone: string,
  time: string,
  now: number,
  graceMs = 0,
): ProactiveSlot => {
  const today = dayIn(timeZone, new Date(now));
  for (let offset = 0; ; offset++) {
    const day = addDays(today, offset);
    const at = instantIn(timeZone, day, time);
    if (at > now - graceMs) return { kind, at, day };
  }
};

export const slotStillPlanned = (slot: ProactiveSlot, settings: TiboProactiveSettings, timeZone: string): boolean => {
  const time = slotTime(slot.kind, settings);
  return time !== null && instantIn(timeZone, slot.day, time) === slot.at;
};

export const planFingerprint = (settings: TiboProactiveSettings, timeZone: string) =>
  JSON.stringify({ timeZone, ...settings });

export interface GateInput {
  readonly kind: ProactiveKind;
  readonly settings: TiboProactiveSettings;
  readonly now: number;
  readonly at: number;
  readonly lastMessageAt: number | null;
  readonly busy: boolean;
  readonly lastSeenAt: number | null;
}

export const gate = (input: GateInput): SkipReason | null => {
  const { kind, settings, now } = input;
  if (!settings.enabled) return "off";
  if (!kindEnabled(kind, settings)) return "kind_off";
  if (now - input.at > STALE_MS) return "stale";
  if (input.lastSeenAt === null || now - input.lastSeenAt > DORMANT_MS) return "dormant";
  if (input.busy) return "busy";
  if (input.lastMessageAt !== null && now - input.lastMessageAt < QUIET_MS) return "quiet";
  return null;
};

export interface CheckInFocus {
  readonly kind: ProactiveKind;
  readonly items: readonly string[];
}

export const checkInFocus = (kind: ProactiveKind, day: DayJson | null): CheckInFocus | null => {
  if (!day) return null;
  const dueHabits = day.habits.due.filter((habit) => habit.status === "due").map((habit) => habit.habit.title);
  switch (kind) {
    case "morning_plan": {
      const tasks = day.tasks.open.map(({ task }) => task.title);
      return tasks.length + dueHabits.length > 0 ? { kind, items: [...tasks, ...dueHabits] } : null;
    }
    case "deadline_nudge": {
      const due = day.tasks.open.filter(({ role }) => role !== "assigned").map(({ task }) => task.title);
      return due.length > 0 ? { kind, items: due } : null;
    }
    case "habit_check":
      return dueHabits.length > 0 ? { kind, items: dueHabits } : null;
  }
};

export const clockLabel = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

const listed = (items: readonly string[], max = 5) =>
  items
    .slice(0, max)
    .map((item) => `"${item}"`)
    .join(", ") + (items.length > max ? `, and ${items.length - max} more` : "");

export const triggerLine = (focus: CheckInFocus, time: string): string => {
  const at = ` (${clockLabel(time)})`;
  switch (focus.kind) {
    case "morning_plan":
      return `Morning check-in${at}: Tibo wrote first with a plan for the day.`;
    case "deadline_nudge":
      return `Deadline check-in${at}: due today and still open: ${listed(focus.items)}.`;
    case "habit_check":
      return `Evening habit check-in${at}: still due today: ${listed(focus.items)}.`;
  }
};

const ASKS: Record<ProactiveKind, (focus: CheckInFocus) => string> = {
  morning_plan: () =>
    "It's their morning. Give them a short plan for today from \"The user's day\": what to start with, the one thing that matters most, and the habits due. Two to four items at most, in your voice.",
  deadline_nudge: (focus) =>
    `Due today and still open: ${listed(focus.items)}. One kind, clear nudge to get it done; offer to help break it down or move it. No guilt.`,
  habit_check: (focus) =>
    `It's their evening and these habits are still due today: ${listed(focus.items)}. A light, encouraging reminder; mention a streak only if one is at stake.`,
};

export const checkInSection = (focus: CheckInFocus): ContextSection => ({
  title: "You're messaging first",
  body: [
    "The user didn't write: this is a check-in you start. Keep it to 1 or 2 short bubbles.",
    ASKS[focus.kind](focus),
    "Don't start with a reaction line. Don't mention the app, alarms, settings or being asked to write. Don't use tools in this message; they can ask you to act when they answer.",
  ].join("\n"),
});
