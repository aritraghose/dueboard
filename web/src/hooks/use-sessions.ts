import type { FocusSession, SessionDay, StartSessionInput } from "@dueboard/api/rpc";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LocalDate } from "@/lib/dates";
import { isActive } from "@/lib/sessions";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

// Focus sessions for the UI. Every session query carries the `sessions`
// reactivity key and every session write invalidates it, so the widget, the
// header timer, the day's list and `/sessions` all refetch after a change.
//
// The countdown never trusts the browser's clock against the server's: each
// session answer carries `remainingMs` as of the response, and the browser
// only measures how long ago that answer arrived (`receivedAt`). Wall-clock
// time keeps running while a tab sleeps, so the count stays right after it.

const SESSIONS = ["sessions"];
/**
 * The active session alone. `SessionSync` refreshes it often (on focus, at
 * 0), while `sessions` also reloads `/now`'s whole days (`GetDay`).
 */
const ACTIVE_SESSION = ["active-session"];

/** The running or paused session, or `null`. */
export const activeSessionAtom = ApiClient.query("GetActiveSession", undefined, {
  reactivityKeys: [...SESSIONS, ...ACTIVE_SESSION],
});

/**
 * `/sessions`' list: the first `pages` pages of `ListSessions`, joined. A
 * day that runs over a page boundary is merged back into one group (its
 * `focusedMinutes` is already the whole day's on both pages).
 */
export const sessionListAtom = Atom.family(({ pages, limit }: { pages: number; limit: number }) =>
  Atom.make((get) =>
    Effect.gen(function* () {
      const days: Array<{ date: LocalDate; focusedMinutes: number; sessions: FocusSession[] }> = [];
      let cursor: string | undefined;
      for (let page = 0; page < pages; page++) {
        const payload = { limit, ...(cursor ? { cursor } : {}) };
        const result = yield* get.result(ApiClient.query("ListSessions", payload, { reactivityKeys: SESSIONS }));
        for (const day of result.days) appendDay(days, day);
        if (!result.nextCursor) return { days, nextCursor: null };
        cursor = result.nextCursor;
      }
      return { days, nextCursor: cursor ?? null };
    }),
  ),
);

const appendDay = (
  days: Array<{ date: LocalDate; focusedMinutes: number; sessions: FocusSession[] }>,
  day: SessionDay,
) => {
  const last = days.at(-1);
  if (last && last.date === day.date) last.sessions.push(...day.sessions);
  else days.push({ date: day.date, focusedMinutes: day.focusedMinutes, sessions: [...day.sessions] });
};

/** When each session answer reached the browser, in `Date.now()` time. */
const receivedAt = new WeakMap<FocusSession, number>();
const stamp = (session: FocusSession): number => {
  let at = receivedAt.get(session);
  if (at === undefined) {
    at = Date.now();
    receivedAt.set(session, at);
  }
  return at;
};

/**
 * Planned time left at `now` (ms) for any session answer: counting down from
 * when that answer arrived while running, still while paused.
 */
export const remainingAt = (session: FocusSession | null | undefined, now: number): number => {
  if (!session) return 0;
  if (session.status !== "running") return session.remainingMs;
  return Math.max(0, session.remainingMs - (now - stamp(session)));
};

/**
 * The newest write's answer, shown until the refetch it triggered lands,
 * so pause, resume and extend show at once (the API can take seconds).
 * `before` is the query result that was current when the write answered.
 */
type Written = { readonly session: FocusSession | null; readonly before: unknown };
const writtenAtom = Atom.make<{ written: Written | null }>({ written: null }).pipe(Atom.keepAlive);

/**
 * A session whose countdown reached 0 here: the widget shows its completion
 * moment until dismissed, even after the refetch drops it as active.
 */
const finishedAtom = Atom.make<{ session: FocusSession | null }>({ session: null }).pipe(Atom.keepAlive);

/** Set to ask `/now` to open its Sessions tab; `/now` clears it once open. */
const sessionsTabRequestAtom = Atom.make(false).pipe(Atom.keepAlive);

/** Asks `/now` to open its Sessions tab (now, or once the user gets there). */
export function useOpenSessionsTab(): () => void {
  const registry = useContext(RegistryContext);
  return useCallback(() => registry.set(sessionsTabRequestAtom, true), [registry]);
}

/** Whether the Sessions tab was asked for, and a way to say it's open. */
export function useSessionsTabRequest() {
  const registry = useContext(RegistryContext);
  const requested = useAtomValue(sessionsTabRequestAtom);
  const handled = useCallback(() => registry.set(sessionsTabRequestAtom, false), [registry]);
  return [requested, handled] as const;
}

export type ActiveSession = {
  /** The running or paused session, or `null`. `undefined` until the first answer. */
  readonly session: FocusSession | null | undefined;
  /** Planned time left at `now` (ms): counting down while running, still while paused. */
  readonly remainingAt: (now: number) => number;
  readonly failed: boolean;
  /** A request for it is in flight; reloading now would cancel that request. */
  readonly waiting: boolean;
};

/** The active session, with the latest write's answer on top. */
export function useActiveSession(): ActiveSession {
  const registry = useContext(RegistryContext);
  const result = useAtomValue(activeSessionAtom);
  const { written } = useAtomValue(writtenAtom);

  // A settled answer newer than the write replaces it.
  const settledAfterWrite =
    written !== null && AsyncResult.isSuccess(result) && !result.waiting && result !== written.before;
  useEffect(() => {
    if (settledAfterWrite) {
      registry.update(writtenAtom, (current) => (current.written === written ? { written: null } : current));
    }
  }, [settledAfterWrite, written, registry]);

  const queried = AsyncResult.isSuccess(result) ? result.value : undefined;
  const session = written && !settledAfterWrite ? written.session : queried;
  const remaining = useCallback((now: number) => remainingAt(session, now), [session]);
  return {
    session,
    remainingAt: remaining,
    failed: session === undefined && AsyncResult.isFailure(result),
    waiting: result.waiting,
  };
}

/** The session that just finished here, for the completion moment. */
export function useFinishedSession() {
  const registry = useContext(RegistryContext);
  const { session } = useAtomValue(finishedAtom);
  const dismiss = useCallback(() => registry.set(finishedAtom, { session: null }), [registry]);
  return { finished: session, dismiss };
}

/**
 * The active session for timers on screen: one whose countdown just reached
 * 0 here is gone at once, not left at 0:00 until the server's answer lands.
 */
export function useTimerSession(): ActiveSession {
  const active = useActiveSession();
  const { finished } = useFinishedSession();
  return active.session && finished?.id === active.session.id ? { ...active, session: null } : active;
}

/**
 * The current time in ms, every `intervalMs` while `enabled`. Shorter than a
 * second so the countdown changes close to each real second. Ticks land on
 * the same wall-clock beat everywhere, so the widget, the header and the
 * tab title never show different seconds.
 */
export function useTicker(enabled: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      timer = setTimeout(tick, intervalMs - (at % intervalMs));
    };
    tick();
    return () => clearTimeout(timer);
  }, [enabled, intervalMs]);
  return now;
}

/** Sessions deleted in this session of the app: lists leave them out while the delete is under way. */
const removedSessionsAtom = Atom.make({ ids: new Set<string>() as ReadonlySet<string> }).pipe(Atom.keepAlive);

export function useIsSessionRemoved(): (id: string) => boolean {
  const { ids } = useAtomValue(removedSessionsAtom);
  return useCallback((id: string) => ids.has(id), [ids]);
}

/** Session writes, each its own short-lived call (see `useRun`). Each returns its `Exit`. */
export function useSessionActions() {
  const registry = useContext(RegistryContext);
  const run = useRun();
  return useMemo(() => {
    // The answer shows at once; ended sessions are no longer active.
    const write = async <E>(effect: Effect.Effect<FocusSession, E, ApiClient | Reactivity.Reactivity>) => {
      const exit = await run(effect.pipe(Reactivity.mutation(SESSIONS)));
      // Read after the write: an answer that landed while it ran is older than it.
      const before = registry.get(activeSessionAtom);
      if (Exit.isSuccess(exit)) {
        stamp(exit.value);
        registry.set(writtenAtom, { written: { session: isActive(exit.value) ? exit.value : null, before } });
      }
      return exit;
    };
    return {
      start: async (payload: StartSessionInput) => {
        const exit = await write(ApiClient.use((client) => client("StartSession", payload)));
        if (Exit.isSuccess(exit)) registry.set(finishedAtom, { session: null });
        return exit;
      },
      pause: (id: string) => write(ApiClient.use((client) => client("PauseSession", { id }))),
      resume: (id: string) => write(ApiClient.use((client) => client("ResumeSession", { id }))),
      extend: (id: string, minutes: number) =>
        write(ApiClient.use((client) => client("ExtendSession", { id, minutes }))),
      stop: (id: string) => write(ApiClient.use((client) => client("StopSession", { id }))),
      // The row hides at once and comes back only if the delete fails.
      remove: async (id: string) => {
        registry.update(removedSessionsAtom, ({ ids }) => ({ ids: new Set(ids).add(id) }));
        const exit = await run(
          ApiClient.use((client) => client("DeleteSession", { id })).pipe(Reactivity.mutation(SESSIONS)),
        );
        if (Exit.isFailure(exit)) {
          registry.update(removedSessionsAtom, ({ ids }) => {
            const next = new Set(ids);
            next.delete(id);
            return { ids: next };
          });
        }
        return exit;
      },
      /** Marks a session as just finished here (its countdown reached 0). */
      finish: (session: FocusSession) => registry.set(finishedAtom, { session }),
      /** Refetches every session query on screen, failed ones included. */
      reload: () => run(Reactivity.invalidate(SESSIONS)),
      /** Refetches only the active session. */
      reloadActive: () => run(Reactivity.invalidate(ACTIVE_SESSION)),
    };
  }, [run, registry]);
}
