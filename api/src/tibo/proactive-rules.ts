// Tibo's check-ins (architecture.md §7.8, step 20): when Tibo messages
// first, and when it stays quiet. Pure, so `proactive-rules.test.ts` covers
// it; `./proactive.ts` stores what was sent and `./TiboAgent.ts` arms the
// alarms and runs the turns.
//
// Three kinds, each at a local time (alarms the agent re-arms every day,
// planned in the user's zone): the morning plan, the deadline nudge and the
// evening habit check. Finished focus sessions get no message (decided in
// step 20: it read as nagging).

import type { TiboProactiveSettings } from "../domain-client.ts";
import { TIBO_DEADLINE_NUDGE_TIME } from "../domain/tibo-constants.ts";
import type { ContextSection } from "./context.ts";
import { addDays, dayIn, instantIn } from "./dates.ts";
import type { DayJson } from "./views.ts";

export const PROACTIVE_KINDS = ["morning_plan", "deadline_nudge", "habit_check"] as const;
export type ProactiveKind = (typeof PROACTIVE_KINDS)[number];
/** Every kind comes at a time of day. */
export const SCHEDULED_KINDS = PROACTIVE_KINDS;
export type ScheduledKind = ProactiveKind;

/** A message (theirs or Tibo's) this recent means they're mid-conversation: stay quiet. */
export const QUIET_MS = 10 * 60_000;
/** A check-in this late (an alarm delayed, an event delivered late) is skipped, never sent old. */
export const STALE_MS = 30 * 60_000;
/** Re-planning keeps a slot that came due this recently, so a sibling due at the same minute still runs. */
export const PLAN_GRACE_MS = 2 * 60_000;
/** No app visit for this long: the timed check-ins pause until they're back. */
export const DORMANT_MS = 7 * 24 * 60 * 60_000;

/** Why a check-in wasn't sent (stored in the log, logged under `alchemy dev`). */
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

/** The local time a timed kind comes at, or `null` while it's off. */
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

/** One alarm: a kind on one local day, at the instant it was planned for. */
export interface ProactiveSlot {
  readonly kind: ScheduledKind;
  /** ms */
  readonly at: number;
  /** `YYYY-MM-DD` in the user's zone. */
  readonly day: string;
  /** Armed by the dev route (`dev/alarm`), at any minute. */
  readonly dev?: true;
}

/**
 * The next time the zone's clocks show `time` after `now - graceMs`: today
 * if it's still ahead, otherwise tomorrow. Computed per day, so DST moves
 * the instant, not the local time.
 */
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

/** Whether a fired slot still matches the settings (the time or the zone may have moved since it was armed). */
export const slotStillPlanned = (slot: ProactiveSlot, settings: TiboProactiveSettings, timeZone: string): boolean => {
  const time = slotTime(slot.kind, settings);
  return time !== null && instantIn(timeZone, slot.day, time) === slot.at;
};

/** What the plan depends on: a change re-arms every alarm. */
export const planFingerprint = (settings: TiboProactiveSettings, timeZone: string) =>
  JSON.stringify({ timeZone, ...settings });

export interface GateInput {
  readonly kind: ProactiveKind;
  readonly settings: TiboProactiveSettings;
  readonly now: number;
  /** When it was meant for: the alarm's slot. */
  readonly at: number;
  /** The newest message of the user's or Tibo's (ms), `null` for an empty thread. */
  readonly lastMessageAt: number | null;
  /** A turn is running. */
  readonly busy: boolean;
  /** The user last had the app open (ms), `null` if never seen. */
  readonly lastSeenAt: number | null;
}

/**
 * Whether a check-in may go now, before anything is fetched: `null` to go
 * on, or why not. What's on the user's board (`checkInFocus`) and the
 * quota are checked after. There's no count limit: check-ins draw on the
 * same monthly quota as every other Tibo request, and the user turns them
 * off in Settings. Each timed kind comes at most once a day by its slot.
 */
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

/** What a check-in is about, from the user's day: the items it names. */
export interface CheckInFocus {
  readonly kind: ProactiveKind;
  /** Open tasks and due habits (morning), open tasks due today (deadline nudge), due habits (habit check). */
  readonly items: readonly string[];
}

/** The items a check-in would name, or `null` when there's nothing useful to say. */
export const checkInFocus = (kind: ProactiveKind, day: DayJson | null): CheckInFocus | null => {
  if (!day) return null;
  const dueHabits = day.habits.due.filter((habit) => habit.status === "due").map((habit) => habit.habit.title);
  switch (kind) {
    case "morning_plan": {
      const tasks = day.tasks.open.map(({ task }) => task.title);
      // Active goals alone show every day, so they don't make a plan worth sending.
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

/** "8:00 AM" from `HH:MM`. */
export const clockLabel = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

const listed = (items: readonly string[], max = 5) =>
  items
    .slice(0, max)
    .map((item) => `"${item}"`)
    .join(", ") + (items.length > max ? `, and ${items.length - max} more` : "");

/**
 * The thread's record of why Tibo wrote first: a `system_event` row, hidden
 * in the app, which later turns read as an app event. Short, since it stays
 * in the recent window.
 */
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

/** This turn's instructions, as a context section after the user's day. */
export const checkInSection = (focus: CheckInFocus): ContextSection => ({
  title: "You're messaging first",
  body: [
    "The user didn't write: this is a check-in you start. Keep it to 1 or 2 short bubbles.",
    ASKS[focus.kind](focus),
    "Don't start with a reaction line. Don't mention the app, alarms, settings or being asked to write. Don't use tools in this message; they can ask you to act when they answer.",
  ].join("\n"),
});
