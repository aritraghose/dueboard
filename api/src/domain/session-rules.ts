import type { LocalDate } from "./dates.ts";
import { SESSION_MINUTES_MAX, type SessionAction, type SessionStatus } from "./model.ts";

export interface Segment {
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

const MINUTE_MS = 60_000;

export const elapsed = (segments: ReadonlyArray<Segment>, now: Date): number =>
  segments.reduce((total, { startedAt, endedAt }) => {
    const end = (endedAt ?? now).getTime();
    return total + Math.max(0, end - startedAt.getTime());
  }, 0);

export const remaining = (
  plannedMinutes: number,
  segments: ReadonlyArray<Segment>,
  now: Date,
): number => Math.max(0, plannedMinutes * MINUTE_MS - elapsed(segments, now));

export const computeEndsAt = (
  plannedMinutes: number,
  segments: ReadonlyArray<Segment>,
  now: Date,
): Date => new Date(now.getTime() + remaining(plannedMinutes, segments, now));

export const isExpired = (
  session: { readonly status: SessionStatus; readonly endsAt: Date | null },
  now: Date,
): boolean => session.status === "running" && session.endsAt !== null && session.endsAt <= now;

export const canApply = (status: SessionStatus, action: SessionAction): boolean => {
  switch (action) {
    case "pause":
      return status === "running";
    case "resume":
      return status === "paused";
    case "extend":
    case "stop":
      return status === "running" || status === "paused";
  }
};

export const transitionError = (status: SessionStatus, action: SessionAction): string | null => {
  if (canApply(status, action)) return null;
  if (status === "completed" || status === "stopped") return "This session has already ended.";
  return action === "pause" ? "This session is already paused." : "This session is already running.";
};

export const extendError = (plannedMinutes: number, minutes: number): string | null =>
  plannedMinutes + minutes > SESSION_MINUTES_MAX
    ? `A session can last at most ${SESSION_MINUTES_MAX} minutes.`
    : null;

export const focusedMinutes = (ms: number): number => Math.floor(ms / MINUTE_MS);

export const elapsedByDay = (
  sessions: ReadonlyArray<{ readonly localDate: LocalDate; readonly segments: ReadonlyArray<Segment> }>,
  now: Date,
): Map<LocalDate, number> => {
  const totals = new Map<LocalDate, number>();
  for (const { localDate, segments } of sessions) {
    totals.set(localDate, (totals.get(localDate) ?? 0) + elapsed(segments, now));
  }
  return totals;
};
