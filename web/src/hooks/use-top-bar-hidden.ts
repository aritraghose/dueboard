import { useSyncExternalStore } from "react";

// Whether `/now` hides the top row (Start a session, the clock, Tibo). Shared
// by the row and the toggle on the day card, and remembered per viewer.
// Visible by default, and always on the server.

const KEY = "dueboard-now-top-bar-hidden";
const listeners = new Set<() => void>();

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
};

let hidden: boolean | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setTopBarHidden(next: boolean) {
  hidden = next;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // Not remembered this time; the toggle still works.
  }
  for (const listener of listeners) listener();
}

/** Whether the top row is hidden on pages that allow it (`topBar.hideable`). */
export function useTopBarHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hidden ??= read()),
    () => false,
  );
}
