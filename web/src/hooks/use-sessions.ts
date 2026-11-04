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

const SESSIONS = ["sessions"];
const ACTIVE_SESSION = ["active-session"];

export const activeSessionAtom = ApiClient.query("GetActiveSession", undefined, {
  reactivityKeys: [...SESSIONS, ...ACTIVE_SESSION],
});

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

const receivedAt = new WeakMap<FocusSession, number>();
const stamp = (session: FocusSession): number => {
  let at = receivedAt.get(session);
  if (at === undefined) {
    at = Date.now();
    receivedAt.set(session, at);
  }
  return at;
};

export const remainingAt = (session: FocusSession | null | undefined, now: number): number => {
  if (!session) return 0;
  if (session.status !== "running") return session.remainingMs;
  return Math.max(0, session.remainingMs - (now - stamp(session)));
};

type Written = { readonly session: FocusSession | null; readonly before: unknown };
const writtenAtom = Atom.make<{ written: Written | null }>({ written: null }).pipe(Atom.keepAlive);

const finishedAtom = Atom.make<{ session: FocusSession | null }>({ session: null }).pipe(Atom.keepAlive);

const sessionsTabRequestAtom = Atom.make(false).pipe(Atom.keepAlive);

export function useOpenSessionsTab(): () => void {
  const registry = useContext(RegistryContext);
  return useCallback(() => registry.set(sessionsTabRequestAtom, true), [registry]);
}

export function useSessionsTabRequest() {
  const registry = useContext(RegistryContext);
  const requested = useAtomValue(sessionsTabRequestAtom);
  const handled = useCallback(() => registry.set(sessionsTabRequestAtom, false), [registry]);
  return [requested, handled] as const;
}

export type ActiveSession = {
  readonly session: FocusSession | null | undefined;
  readonly remainingAt: (now: number) => number;
  readonly failed: boolean;
  readonly waiting: boolean;
};

export function useActiveSession(): ActiveSession {
  const registry = useContext(RegistryContext);
  const result = useAtomValue(activeSessionAtom);
  const { written } = useAtomValue(writtenAtom);

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

export function useFinishedSession() {
  const registry = useContext(RegistryContext);
  const { session } = useAtomValue(finishedAtom);
  const dismiss = useCallback(() => registry.set(finishedAtom, { session: null }), [registry]);
  return { finished: session, dismiss };
}

export function useTimerSession(): ActiveSession {
  const active = useActiveSession();
  const { finished } = useFinishedSession();
  return active.session && finished?.id === active.session.id ? { ...active, session: null } : active;
}

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

const removedSessionsAtom = Atom.make({ ids: new Set<string>() as ReadonlySet<string> }).pipe(Atom.keepAlive);

export function useIsSessionRemoved(): (id: string) => boolean {
  const { ids } = useAtomValue(removedSessionsAtom);
  return useCallback((id: string) => ids.has(id), [ids]);
}

export function useSessionActions() {
  const registry = useContext(RegistryContext);
  const run = useRun();
  return useMemo(() => {
    const write = async <E>(effect: Effect.Effect<FocusSession, E, ApiClient | Reactivity.Reactivity>) => {
      const exit = await run(effect.pipe(Reactivity.mutation(SESSIONS)));
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
      finish: (session: FocusSession) => registry.set(finishedAtom, { session }),
      reload: () => run(Reactivity.invalidate(SESSIONS)),
      reloadActive: () => run(Reactivity.invalidate(ACTIVE_SESSION)),
    };
  }, [run, registry]);
}
