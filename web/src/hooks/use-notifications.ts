import type { NotificationItem } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Reactivity from "effect/reactivity/Reactivity";
import { useCallback, useEffect, useRef } from "react";
import { ApiClient } from "../rpc-client.ts";
import { useRun } from "./use-tasks.ts";

// Notifications (`ListNotifications`, `GetUnseenNotifications`). Both reads
// carry `notifications` and `social`, so answering a request anywhere
// updates them; `NotificationsSync` asks again every minute while the tab
// is visible, since other people's requests arrive with no write of ours.

const NOTIFICATIONS = ["notifications"];
const KEYS = ["notifications", "social"];
/** How often the unseen count (and the list, if open) is asked for again. */
const POLL_MS = 60_000;

const listAtom = ApiClient.query("ListNotifications", undefined, { reactivityKeys: KEYS });
const unseenAtom = ApiClient.query("GetUnseenNotifications", undefined, { reactivityKeys: KEYS });

/** The list, newest first (kept while a refresh is in flight); `undefined` until it first arrives. */
export function useNotifications() {
  const run = useRun();
  const result = useAtomValue(listAtom);
  const last = useRef<readonly NotificationItem[] | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const reload = useCallback(() => void run(Reactivity.invalidate(NOTIFICATIONS)), [run]);
  return {
    items: last.current,
    failed: !last.current && AsyncResult.isFailure(result),
    reload,
  };
}

/** How many notifications are unseen (0 until the count arrives, or if it fails). */
export function useUnseenNotifications(): number {
  const result = useAtomValue(unseenAtom);
  const last = useRef(0);
  if (AsyncResult.isSuccess(result)) last.current = result.value.count;
  return last.current;
}

/** Marks them all seen, then counts again (the nav dot goes). */
export function useMarkNotificationsSeen() {
  const run = useRun();
  return useCallback(
    () =>
      run(
        ApiClient.use((client) => client("MarkNotificationsSeen", undefined)).pipe(
          Reactivity.mutation(NOTIFICATIONS),
        ),
      ),
    [run],
  );
}

/**
 * Asks for notifications again every minute while the tab is visible;
 * pauses while hidden and catches up on return. Mounted once, by the app
 * shell.
 */
export function NotificationsSync() {
  const run = useRun();
  useEffect(() => {
    const poll = () => {
      lastPoll = Date.now();
      void run(Reactivity.invalidate(NOTIFICATIONS));
    };
    let lastPoll = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
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
  }, [run]);
  return null;
}
