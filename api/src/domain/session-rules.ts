import type { LocalDate } from "./dates.ts";
import { SESSION_MINUTES_MAX, type SessionAction, type SessionStatus } from "./model.ts";

// Pure focus-session rules, shared by `sessions.ts` and its tests. No I/O.
// Times are `Date`s and durations milliseconds; a session's elapsed time is
// the sum of its running segments (architecture.md §11).

export interface Segment {
  readonly startedAt: Date;
  /** `null` while this stretch is still running. */
  readonly endedAt: Date | null;
}

const MINUTE_MS = 60_000;

/** Time spent running as of `now`: closed segments plus the open one up to `now`. */
export const elapsed = (segments: ReadonlyArray<Segment>, now: Date): number =>
  segments.reduce((total, { startedAt, endedAt }) => {
    const end = (endedAt ?? now).getTime();
    return total + Math.max(0, end - startedAt.getTime());
  }, 0);

/** Planned time not yet spent as of `now`, never below 0. */
export const remaining = (
  plannedMinutes: number,
  segments: ReadonlyArray<Segment>,
  now: Date,
): number => Math.max(0, plannedMinutes * MINUTE_MS - elapsed(segments, now));

/**
 * When a running session's time runs out: `now` plus what's left. With the
 * open segment counted up to `now`, the result doesn't depend on `now`, so
 * resume and extend can recompute it at any moment.
 */
export const computeEndsAt = (
  plannedMinutes: number,
  segments: ReadonlyArray<Segment>,
  now: Date,
): Date => new Date(now.getTime() + remaining(plannedMinutes, segments, now));

/** Whether a session's time has run out but it hasn't been completed yet. */
export const isExpired = (
  session: { readonly status: SessionStatus; readonly endsAt: Date | null },
  now: Date,
): boolean => session.status === "running" && session.endsAt !== null && session.endsAt <= now;

/** Whether `action` can be applied to a session in `status`. */
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

/** Why `action` can't be applied in `status`, or `null` when it can. */
export const transitionError = (status: SessionStatus, action: SessionAction): string | null => {
  if (canApply(status, action)) return null;
  if (status === "completed" || status === "stopped") return "This session has already ended.";
  return action === "pause" ? "This session is already paused." : "This session is already running.";
};

/** Why an extend can't add `minutes` to `plannedMinutes`, or `null` when it can. */
export const extendError = (plannedMinutes: number, minutes: number): string | null =>
  plannedMinutes + minutes > SESSION_MINUTES_MAX
    ? `A session can last at most ${SESSION_MINUTES_MAX} minutes.`
    : null;

/** Milliseconds as whole focused minutes, rounded down. */
export const focusedMinutes = (ms: number): number => Math.floor(ms / MINUTE_MS);

/** The total elapsed time per day of `sessions`, each measured as of `now`. */
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
