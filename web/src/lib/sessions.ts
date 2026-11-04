import { type FocusSession, SESSION_LABEL_MAX_LENGTH, SESSION_MINUTES_MAX, type SessionStatus } from "@dueboard/api/rpc";

export { SESSION_LABEL_MAX_LENGTH, SESSION_MINUTES_MAX };

export const START_PRESETS = [15, 25, 50, 90] as const;
export const EXTEND_PRESETS = [5, 15] as const;
export const DEFAULT_MINUTES = 25;

export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};

export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const focusedMinutes = (session: FocusSession): number => Math.floor(session.elapsedMs / 60_000);

export const formatFocused = (session: FocusSession): string => {
  const minutes = focusedMinutes(session);
  return minutes === 0 && session.elapsedMs > 0 ? "<1 min" : formatMinutes(minutes);
};

export const sessionName = (session: { readonly label: string | null }): string => session.label ?? "Focus session";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  stopped: "Stopped",
};

export const isActive = (session: { readonly status: SessionStatus }): boolean =>
  session.status === "running" || session.status === "paused";

export const cleanLabel = (text: string): string | undefined =>
  text.replace(/\s*[\r\n]+\s*/g, " ").trim().slice(0, SESSION_LABEL_MAX_LENGTH) || undefined;

export const parseMinutes = (text: string, max = SESSION_MINUTES_MAX): number | null => {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
};
