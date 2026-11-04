import { useMatches } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { SessionIndicator } from "@/components/focus-session";
import { NotificationsButton } from "@/components/notifications-button";
import { TiboButton } from "@/components/tibo-panel";
import { useTimerSession } from "@/hooks/use-sessions";
import { useTopBarHidden } from "@/hooks/use-top-bar-hidden";
import { cn } from "@/lib/utils";

export type TopBarSlots = {
  readonly start?: ComponentType;
  readonly center?: ComponentType;
  readonly tibo?: boolean;
  readonly tiboInPage?: boolean;
  readonly hideable?: boolean;
  readonly session?: boolean;
  readonly notifications?: boolean;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    topBar?: TopBarSlots;
  }
}

export function useTopBarSlots(): TopBarSlots | undefined {
  return useMatches({
    select: (matches) => matches.findLast((match) => match.staticData.topBar)?.staticData.topBar,
  });
}

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
  const phoneRow = controls;
  const wideRow = controls || bell || tibo;
  const floatingBell = bell && !phoneRow;
  const floating = (
    <>
      {floatingBell && <NotificationsButton className="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 bg-chrome shadow-(--card-shadow) ring-1 ring-border backdrop-blur-md md:hidden" />}
      {session && (
        <SessionIndicator
          className={cn(
            "fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-30 shadow-(--card-shadow)",
            floatingBell && "max-md:right-13",
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
