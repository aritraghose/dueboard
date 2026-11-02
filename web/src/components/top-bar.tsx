import { useMatches } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { TiboButton } from "@/components/tibo-panel";
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
 * The `_app` top row: the page's own controls, then Tibo, on one line. On
 * phones Tibo floats above the nav instead (`TiboFab`), so a row with only
 * Tibo in it isn't drawn there.
 */
export function TopBar({ className }: { className?: string }) {
  const slots = useTopBarSlots();
  const Start = slots?.start;
  const Center = slots?.center;
  const tibo = slots?.tibo ?? true;
  if (!Start && !Center && !tibo) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:px-3",
        !Start && !Center && "max-md:hidden",
        className,
      )}
    >
      <div className="flex min-w-0 items-center">{Start && <Start />}</div>
      <div className="flex items-center justify-center">{Center && <Center />}</div>
      <div className="flex items-center justify-end max-md:hidden">{tibo && <TiboButton />}</div>
    </div>
  );
}
