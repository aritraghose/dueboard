import { useMatches } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { SessionIndicator } from "@/components/focus-session";
import { TiboButton } from "@/components/tibo-panel";
import { useTimerSession } from "@/hooks/use-sessions";
import { useTopBarHidden } from "@/hooks/use-top-bar-hidden";
import { cn } from "@/lib/utils";

/**
 * What a page adds to the `_app` top row, through its route's `staticData`
 * (`staticData: { topBar: { start, center } }`). Tibo holds the end unless
 * the page turns it off; a row with nothing in it isn't drawn.
 */
export type TopBarSlots = {
  readonly start?: ComponentType;
  readonly center?: ComponentType;
  /** `false` hides the Tibo button (`/inbox` is Tibo already). */
  readonly tibo?: boolean;
  /** The page has a toggle that hides the whole row (`/now`; see `useTopBarHidden`). */
  readonly hideable?: boolean;
  /** `false` when the page shows the active session itself (`/now`'s start slot). */
  readonly session?: boolean;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    topBar?: TopBarSlots;
  }
}

/** The deepest matched route's top-row slots. */
export function useTopBarSlots(): TopBarSlots | undefined {
  return useMatches({
    select: (matches) => matches.findLast((match) => match.staticData.topBar)?.staticData.topBar,
  });
}

/**
 * The `_app` top row: the page's own controls, then the active focus
 * session's timer and Tibo, on one line. On phones Tibo floats above the nav
 * instead (`TiboFab`), so a row with only Tibo in it isn't drawn there.
 *
 * The session timer never draws the row by itself, since that would push the
 * page down: where the row isn't drawn (`/inbox`, or any page on phones with
 * no controls of its own), the timer floats in the top corner instead.
 */
export function TopBar({ className }: { className?: string }) {
  const slots = useTopBarSlots();
  const Start = slots?.start;
  const Center = slots?.center;
  const tibo = slots?.tibo ?? true;
  const hidden = useTopBarHidden();
  const active = useTimerSession().session;
  const session = (slots?.session ?? true) && Boolean(active);
  if (slots?.hideable && hidden) return null;

  const controls = Boolean(Start || Center);
  // Whether the row is drawn: on phones only for the page's controls.
  const row = controls || tibo;
  const floating = session && (
    <SessionIndicator
      className={cn(
        "fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 shadow-(--card-shadow)",
        // In the row wherever the row is drawn.
        controls ? "hidden!" : tibo && "md:hidden!",
      )}
    />
  );
  if (!row) return floating || null;

  return (
    <>
      {floating}
      <div
        className={cn(
          "sticky top-0 z-30 grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:px-3",
          !controls && "max-md:hidden",
          className,
        )}
      >
        <div className="flex min-w-0 items-center">{Start && <Start />}</div>
        <div className="flex items-center justify-center">{Center && <Center />}</div>
        <div className="flex items-center justify-end gap-2">
          {session && <SessionIndicator className={cn(!controls && "max-md:hidden!")} />}
          {tibo && (
            <div className="flex max-md:hidden">
              <TiboButton />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
