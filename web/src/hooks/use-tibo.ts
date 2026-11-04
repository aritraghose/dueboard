import { createContext, useContext, useSyncExternalStore } from "react";
import type { TiboStore, TiboThreadState } from "@/lib/tibo-store";

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

export function useTiboThread(): TiboThreadState {
  const { store } = useTibo();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
