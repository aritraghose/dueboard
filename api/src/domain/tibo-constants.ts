// Tibo's check-in settings (step 20), with no Effect, so the AgentWorker's
// bundle can import them (`../tibo/proactive-rules.ts`). Re-exported by
// `./model.ts`, which adds their Schemas.

/** When the morning plan can come: local time, on the half hour. */
export const TIBO_MORNING_TIMES = [
  "05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30",
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00",
] as const;
export type TiboMorningTime = (typeof TIBO_MORNING_TIMES)[number];
export const TIBO_MORNING_TIME_DEFAULT: TiboMorningTime = "08:00";

/** When the evening habit check can come: local time, on the half hour. */
export const TIBO_EVENING_TIMES = [
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
] as const;
export type TiboEveningTime = (typeof TIBO_EVENING_TIMES)[number];
export const TIBO_EVENING_TIME_DEFAULT: TiboEveningTime = "20:00";

/**
 * Deadline nudges come at this local time. Deadlines are dates with no
 * time, so mid-afternoon: late enough that the day's plans have played
 * out, early enough to still finish before the evening.
 */
export const TIBO_DEADLINE_NUDGE_TIME = "15:00";

/** What the domain tells a user's `TiboAgent` (the `tibo_events` outbox). */
export const TIBO_EVENT_KIND = ["settings_changed"] as const;
export type TiboEventKind = (typeof TIBO_EVENT_KIND)[number];
