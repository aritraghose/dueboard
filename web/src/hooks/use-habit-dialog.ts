import type { Habit } from "@dueboard/api/rpc";
import { useCallback, useState } from "react";

/** What the habit dialog shows: a new habit, or an existing one to edit. */
export type HabitDialogTarget = { readonly mode: "create" } | { readonly mode: "edit"; readonly habit: Habit };

/**
 * The habit dialog's target, and whether it's open. The target is kept after
 * closing so the dialog can animate out with its contents; `version` changes
 * on every open, so the form always starts from the target.
 */
export function useHabitDialog() {
  const [state, setState] = useState<{ target: HabitDialogTarget | null; open: boolean; version: number }>({
    target: null,
    open: false,
    version: 0,
  });
  const show = useCallback(
    (target: HabitDialogTarget) => setState((current) => ({ target, open: true, version: current.version + 1 })),
    [],
  );
  const openHabit = useCallback((habit: Habit) => show({ mode: "edit", habit }), [show]);
  const openNew = useCallback(() => show({ mode: "create" }), [show]);
  const setOpen = useCallback((next: boolean) => setState((current) => ({ ...current, open: next })), []);
  return { ...state, openHabit, openNew, setOpen };
}
