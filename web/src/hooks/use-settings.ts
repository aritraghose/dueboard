import type { SettingsPatch } from "@dueboard/api/rpc";
import { RegistryContext } from "@effect/atom-react";
import * as Exit from "effect/Exit";
import { useCallback, useContext } from "react";
import { ApiClient } from "../rpc-client.ts";
import { savedSettingsAtom } from "./use-bootstrap.ts";
import { useRun } from "./use-tasks.ts";

/**
 * Saves a settings change and makes the returned settings the app's own
 * (`useBootstrap`), so every composer and card uses the new defaults at
 * once. Resolves to the call's `Exit`.
 */
export function useUpdateSettings() {
  const registry = useContext(RegistryContext);
  const run = useRun();
  return useCallback(
    async (patch: SettingsPatch) => {
      const exit = await run(ApiClient.use((client) => client("UpdateSettings", patch)));
      if (Exit.isSuccess(exit)) registry.set(savedSettingsAtom, exit.value);
      return exit;
    },
    [registry, run],
  );
}
