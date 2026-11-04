import type { Settings } from "@dueboard/api/rpc";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as Exit from "effect/Exit";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ApiClient } from "../rpc-client.ts";

const bootstrapAtom = ApiClient.mutation("Bootstrap");

export const savedSettingsAtom = Atom.make<Settings | undefined>(undefined).pipe(Atom.keepAlive);

export const browserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

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

export function useBootstrap() {
  const result = useAtomValue(bootstrapAtom);
  const saved = useAtomValue(savedSettingsAtom);
  const value = AsyncResult.isSuccess(result) ? result.value : undefined;
  return useMemo(
    () => (value && saved ? { tags: value.tags, settings: saved } : value),
    [value, saved],
  );
}

export function useTimeZone(): string {
  const bootstrap = useBootstrap();
  return bootstrap?.settings.timeZone ?? browserTimeZone();
}
