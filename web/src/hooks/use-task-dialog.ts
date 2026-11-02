import type { Task } from "@dueboard/api/rpc";
import { useCallback, useState } from "react";
import type { LocalDate } from "@/lib/dates";

/** What the task dialog shows: a new task (on `date`, or unscheduled when `null`) or an existing one. */
export type TaskDialogTarget =
  | { readonly mode: "create"; readonly date: LocalDate | null }
  | { readonly mode: "edit"; readonly task: Task };

/**
 * The task dialog's target, and whether it's open. The target is kept after
 * closing so the dialog can animate out with its contents.
 */
export function useTaskDialog() {
  const [state, setState] = useState<{ target: TaskDialogTarget | null; open: boolean; version: number }>({
    target: null,
    open: false,
    version: 0,
  });
  const show = useCallback(
    (target: TaskDialogTarget) => setState((current) => ({ target, open: true, version: current.version + 1 })),
    [],
  );
  const openTask = useCallback((task: Task) => show({ mode: "edit", task }), [show]);
  const openNew = useCallback((date: LocalDate | null) => show({ mode: "create", date }), [show]);
  const setOpen = useCallback((next: boolean) => setState((current) => ({ ...current, open: next })), []);
  return { ...state, openTask, openNew, setOpen };
}
