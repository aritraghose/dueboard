import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Exit from "effect/Exit";
import { useEffect } from "react";
import { toast } from "sonner";
import { ApiClient } from "../rpc-client.ts";

// One mutation atom for the whole app: the `_app` layout runs it, and any
// component reads its last result (settings, tags) from the same atom.
const bootstrapAtom = ApiClient.mutation("Bootstrap");

/** The browser's IANA zone, or `UTC` where `Intl` can't tell. */
export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * Runs `Bootstrap` once per app load with the browser's time zone: it
 * creates the user's settings and system tags if they're missing and keeps
 * the stored zone in step with where the user is. Called by the `_app` layout.
 */
export function useRunBootstrap() {
  const bootstrap = useAtomSet(bootstrapAtom, { mode: "promiseExit" });
  useEffect(() => {
    void bootstrap({
      payload: { timeZone: browserTimeZone() },
      reactivityKeys: ["settings", "tags"],
    }).then((exit) => {
      if (Exit.isFailure(exit)) toast.error("Couldn't load your settings. Try reloading.");
    });
  }, [bootstrap]);
}

/** The Bootstrap result (settings and tags), or `undefined` until it arrives. */
export function useBootstrap() {
  const result = useAtomValue(bootstrapAtom);
  return AsyncResult.isSuccess(result) ? result.value : undefined;
}

/**
 * The user's time zone, from their settings. Until Bootstrap answers, the
 * browser's zone stands in: it's the zone Bootstrap is about to save.
 * Every date and time the app shows goes through this zone.
 */
export function useTimeZone(): string {
  const bootstrap = useBootstrap();
  return bootstrap?.settings.timeZone ?? browserTimeZone();
}
