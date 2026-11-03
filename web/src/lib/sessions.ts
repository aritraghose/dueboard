import { type FocusSession, SESSION_LABEL_MAX_LENGTH, SESSION_MINUTES_MAX, type SessionStatus } from "@dueboard/api/rpc";

// Focus sessions in words and small rules the UI shares (the API checks them again).

export { SESSION_LABEL_MAX_LENGTH, SESSION_MINUTES_MAX };

/** The lengths offered when starting, in minutes. */
export const START_PRESETS = [15, 25, 50, 90] as const;
/** What the quick extend buttons add, in minutes. */
export const EXTEND_PRESETS = [5, 15] as const;
/** Picked when nothing is remembered yet. */
export const DEFAULT_MINUTES = 25;

/**
 * A countdown: "24:13", or "1:05:00" from an hour up. Seconds round up, so
 * a fresh 25-minute session reads 25:00 and 0:00 shows only at the end.
 */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};

/** "25 min", "1 h", "1 h 5 min". */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/** Whole minutes a session ran, rounded down like the API's daily totals. */
export const focusedMinutes = (session: FocusSession): number => Math.floor(session.elapsedMs / 60_000);

/** "12 min", or "<1 min" for a session that ran under a minute. */
export const formatFocused = (session: FocusSession): string => {
  const minutes = focusedMinutes(session);
  return minutes === 0 && session.elapsedMs > 0 ? "<1 min" : formatMinutes(minutes);
};

/** A session's name: its label, or a plain stand-in. */
export const sessionName = (session: { readonly label: string | null }): string => session.label ?? "Focus session";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  stopped: "Stopped",
};

export const isActive = (session: { readonly status: SessionStatus }): boolean =>
  session.status === "running" || session.status === "paused";

/** A label as the API takes it: one line, trimmed, or nothing. */
export const cleanLabel = (text: string): string | undefined =>
  text.replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, SESSION_LABEL_MAX_LENGTH) || undefined;

/** A typed minute count, or `null` when it isn't a whole number from 1 up to `max`. */
export const parseMinutes = (text: string, max = SESSION_MINUTES_MAX): number | null => {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
};
