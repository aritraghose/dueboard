import type { LiveEvent, LivePage, LiveScope, Path } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

const LIVE_KEYS = ["live", "tasks", "habits", "goals", "sessions", "notes", "social"];
const POLL_MS = 45_000;

const TTL = "2 minutes";

const headAtom = (days: number, scope: LiveScope) =>
  ApiClient.query("GetLive", { days, scope }, { reactivityKeys: LIVE_KEYS, timeToLive: TTL });

const pathAtom = ApiClient.query("GetPath", undefined, { reactivityKeys: LIVE_KEYS, timeToLive: TTL });

const newer = (a: LiveEvent, b: LiveEvent) =>
  a.occurredAt.getTime() > b.occurredAt.getTime() ||
  (a.occurredAt.getTime() === b.occurredAt.getTime() && a.id > b.id);

interface Older {
  readonly events: readonly LiveEvent[];
  readonly cursor: string | null;
  readonly below: LiveEvent;
}

export interface LiveFeed {
  readonly events: readonly LiveEvent[] | undefined;
  readonly hasConnections: boolean;
  readonly failed: boolean;
  readonly hasOlder: boolean;
  readonly loadingOlder: boolean;
  readonly loadOlder: () => void;
  readonly reload: () => void;
}

export function useLiveFeed({ days, scope }: { days: number; scope: LiveScope }): LiveFeed {
  const run = useRun();
  const result = useAtomValue(headAtom(days, scope));
  const lastHead = useRef<{ key: string; value: LivePage } | undefined>(undefined);
  const key = `${days}:${scope}`;
  if (AsyncResult.isSuccess(result)) lastHead.current = { key, value: result.value };
  const head = lastHead.current?.key === key ? lastHead.current.value : undefined;

  const [older, setOlder] = useState<Older | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => setOlder(null), [key]);

  const headLast = head?.events.at(-1);
  const gap = older !== null && head?.nextCursor != null && headLast !== undefined && newer(headLast, older.below);
  useEffect(() => {
    if (gap) setOlder(null);
  }, [gap]);

  let events: readonly LiveEvent[] | undefined;
  if (head) {
    const seen = new Set(head.events.map((event) => event.id));
    events =
      older && !gap && headLast
        ? [...head.events, ...older.events.filter((event) => !seen.has(event.id) && newer(headLast, event))]
        : head.events;
  }
  const cursor: string | null = older && !gap ? older.cursor : (head?.nextCursor ?? null);

  const inFlight = useRef(false);
  const loadOlder = useCallback(() => {
    if (inFlight.current || !cursor || !headLast) return;
    inFlight.current = true;
    setLoadingOlder(true);
    const below = older && !gap ? older.below : headLast;
    void run(ApiClient.use((client) => client("GetLive", { days, scope, cursor })))
      .then((exit) => {
        if (Exit.isFailure(exit)) return;
        setOlder((current) => ({
          events: [...(current && !gap ? current.events : []), ...exit.value.events],
          cursor: exit.value.nextCursor,
          below,
        }));
      })
      .finally(() => {
        inFlight.current = false;
        setLoadingOlder(false);
      });
  }, [cursor, headLast, older, gap, run, days, scope]);

  const reload = useCallback(() => void run(Reactivity.invalidate(["live"])), [run]);

  return {
    events,
    hasConnections: head?.hasConnections ?? true,
    failed: !head && AsyncResult.isFailure(result),
    hasOlder: cursor !== null,
    loadingOlder,
    loadOlder,
    reload,
  };
}

export function usePath() {
  const run = useRun();
  const result = useAtomValue(pathAtom);
  const last = useRef<Path | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  return {
    events: last.current?.events,
    failed: !last.current && AsyncResult.isFailure(result),
    reload: () => void run(Reactivity.invalidate(["live"])),
  };
}

export function useLivePolling() {
  const run = useRun();
  const reload = useCallback(() => void run(Reactivity.invalidate(["live"])), [run]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastPoll = Date.now();
    const poll = () => {
      lastPoll = Date.now();
      reload();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(poll, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") return clearInterval(timer);
      if (Date.now() - lastPoll >= POLL_MS) poll();
      start();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

}
