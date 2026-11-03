import { createContext, useContext, useSyncExternalStore } from "react";
import type { TiboStore, TiboThreadState } from "@/lib/tibo-store";

/**
 * The Tibo panel's open state, shared by the Tibo button and the phone
 * nav's swipe, and the app's one copy of the thread (`lib/tibo-store.ts`).
 */
export type TiboState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  store: TiboStore;
};

export const TiboContext = createContext<TiboState | undefined>(undefined);

export function useTibo(): TiboState {
  const context = useContext(TiboContext);
  if (!context) throw new Error("useTibo must be used within a TiboProvider");
  return context;
}

/** The thread as it is now; re-renders when it changes. */
export function useTiboThread(): TiboThreadState {
  const { store } = useTibo();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
