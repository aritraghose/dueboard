import type { Goal } from "@dueboard/api/rpc";
import { useCallback, useState } from "react";

export type GoalDialogTarget = { readonly mode: "create" } | { readonly mode: "edit"; readonly goal: Goal };

export function useGoalDialog() {
  const [state, setState] = useState<{ target: GoalDialogTarget | null; open: boolean; version: number }>({
    target: null,
    open: false,
    version: 0,
  });
  const show = useCallback(
    (target: GoalDialogTarget) => setState((current) => ({ target, open: true, version: current.version + 1 })),
    [],
  );
  const openGoal = useCallback((goal: Goal) => show({ mode: "edit", goal }), [show]);
  const openNew = useCallback(() => show({ mode: "create" }), [show]);
  const setOpen = useCallback((next: boolean) => setState((current) => ({ ...current, open: next })), []);
  return { ...state, openGoal, openNew, setOpen };
}
