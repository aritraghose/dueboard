import { createContext, useContext } from "react";

/** The Tibo panel's open state, shared by the Tibo button and the phone nav's swipe. */
export type TiboState = { open: boolean; setOpen: (open: boolean) => void };

export const TiboContext = createContext<TiboState | undefined>(undefined);

export function useTibo(): TiboState {
  const context = useContext(TiboContext);
  if (!context) throw new Error("useTibo must be used within a TiboProvider");
  return context;
}
