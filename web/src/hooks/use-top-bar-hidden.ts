import { useSyncExternalStore } from "react";

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
  }
  for (const listener of listeners) listener();
}

export function useTopBarHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (hidden ??= read()),
    () => false,
  );
}
