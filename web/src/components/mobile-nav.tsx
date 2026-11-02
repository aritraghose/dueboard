import { Link, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTibo } from "@/hooks/use-tibo";
import { MAIN_NAV } from "@/lib/nav";
import { type MenuUser, UserAvatar, UserMenuContent } from "@/components/user-menu";
import { cn } from "@/lib/utils";

/** How far a finger must travel up the nav before it counts as a swipe. */
const SWIPE_UP_PX = 36;

const item = cn(
  "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium text-sidebar-foreground/70 transition-colors outline-none",
  "focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground [&_svg]:size-5",
);

/**
 * The phone navigation: a floating, frosted bar like a native app's tab bar,
 * with Now, Inbox, Boards and your profile menu (Settings lives there).
 * Swiping up on it, or tapping its handle, opens Tibo.
 */
export function MobileNav({ user, className }: { user: MenuUser; className?: string }) {
  const { setOpen: openTibo } = useTibo();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40",
        className,
      )}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        const from = start.current;
        start.current = null;
        if (!touch || !from) return;
        const dy = touch.clientY - from.y;
        if (dy < -SWIPE_UP_PX && Math.abs(dy) > Math.abs(touch.clientX - from.x)) openTibo(true);
      }}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center rounded-[1.75rem] border border-sidebar-border bg-sidebar px-2 pb-2 text-sidebar-foreground shadow-lg">
        <button
          type="button"
          onClick={() => openTibo(true)}
          className="group flex h-4 w-20 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Open Tibo (or swipe up)"
        >
          <span className="h-1 w-9 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-tibo" />
        </button>
        <ul className="grid w-full grid-cols-4 gap-1">
          {MAIN_NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} activeOptions={{ includeSearch: false }} className={item}>
                <Icon />
                {label}
              </Link>
            </li>
          ))}
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={item}
                data-status={pathname.startsWith("/settings") ? "active" : undefined}
              >
                <UserAvatar user={user} className="size-5" />
                Profile
              </DropdownMenuTrigger>
              <UserMenuContent user={user} withSettings side="top" align="end" sideOffset={14} />
            </DropdownMenu>
          </li>
        </ul>
      </div>
    </nav>
  );
}
