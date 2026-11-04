import { useMatches } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { SessionIndicator } from "@/components/focus-session";
import { NotificationsButton } from "@/components/notifications-button";
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
  /**
   * The page shows Tibo (and the session timer) in its own header on wide
   * screens (`/live`), so a row with nothing else isn't drawn there. Phones
   * keep the floating button.
   */
  readonly tiboInPage?: boolean;
  /** The page has a toggle that hides the whole row (`/now`; see `useTopBarHidden`). */
  readonly hideable?: boolean;
  /** `false` when the page shows the active session itself (`/now`'s start slot). */
  readonly session?: boolean;
  /** `false` when the page shows the notifications bell in its own header (`/inbox`, `/live`). */
  readonly notifications?: boolean;
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
 * session's timer, the notifications bell and Tibo, on one line. On phones
 * Tibo floats above the nav instead (`TiboFab`), so a row with only the bell
 * in it isn't drawn there.
 *
 * Neither the session timer nor the bell draws the row by itself on phones,
 * since that would push the page down: where the row isn't drawn, they float
 * in the top right corner instead (the bell in the corner, the timer to its
 * left), and `PageHeader` leaves room for them. `/inbox` and `/live` show the
 * bell in their own header.
 */
export function TopBar({ className }: { className?: string }) {
  const slots = useTopBarSlots();
  const Start = slots?.start;
  const Center = slots?.center;
  const tibo = (slots?.tibo ?? true) && !slots?.tiboInPage;
  const bell = slots?.notifications ?? true;
  const hidden = useTopBarHidden();
  const active = useTimerSession().session;
  const session = (slots?.session ?? true) && Boolean(active);
  if (slots?.hideable && hidden) return null;

  const controls = Boolean(Start || Center);
  // Whether the row is drawn: on phones only for the page's controls.
  const phoneRow = controls;
  const wideRow = controls || bell || tibo;
  // On phones without a row the bell floats in the corner, and the timer beside it.
  const floatingBell = bell && !phoneRow;
  const floating = (
    <>
      {floatingBell && <NotificationsButton className="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 bg-chrome shadow-(--card-shadow) ring-1 ring-border backdrop-blur-md md:hidden" />}
      {session && (
        <SessionIndicator
          className={cn(
            "fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 shadow-(--card-shadow)",
            floatingBell && "max-md:right-13",
            // In the row wherever the row is drawn.
            phoneRow && "max-md:hidden!",
            wideRow && "md:hidden!",
          )}
        />
      )}
    </>
  );
  if (!phoneRow && !wideRow) return floating;

  return (
    <>
      {floating}
      <div
        className={cn(
          "sticky top-0 z-30 grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:px-3",
          !phoneRow && "max-md:hidden",
          !wideRow && "md:hidden",
          className,
        )}
      >
        <div className="flex min-w-0 items-center">{Start && <Start />}</div>
        <div className="flex items-center justify-center">{Center && <Center />}</div>
        <div className="flex items-center justify-end gap-2">
          {session && <SessionIndicator />}
          {bell && <NotificationsButton className={cn(!phoneRow && "max-md:hidden")} />}
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
