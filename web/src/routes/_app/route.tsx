import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { TiboFab } from "@/components/tibo-fab";
import { TiboProvider } from "@/components/tibo-panel";
import { TopBar } from "@/components/top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRunBootstrap } from "@/hooks/use-bootstrap";
import { lastCheckedUser, rememberCheckedUser } from "@/lib/session-cache";
import { readSidebarOpen } from "@/lib/sidebar-state";
import { getSessionUser } from "../../session.ts";

/**
 * Pathless layout for the main app. Every route in `_app/` keeps its own
 * path (`_app/now.tsx` is `/now`) but only renders for signed-in users
 * who finished onboarding. The API enforces the same rule on every RPC.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ cause }) => {
    // Moves inside the app (another page, another day on `/now`) reuse the
    // session checked on entry, so they render at once instead of waiting
    // on a server round trip.
    const checked = lastCheckedUser();
    if (cause === "stay" && checked) return { user: checked, sidebarOpen: readSidebarOpen() };
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    if (!user.username) throw redirect({ to: "/onboarding" });
    const onboarded = { ...user, username: user.username };
    rememberCheckedUser(onboarded);
    return { user: onboarded, sidebarOpen: readSidebarOpen() };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, sidebarOpen } = Route.useRouteContext();
  useRunBootstrap();

  return (
    <TiboProvider userId={user.id}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar user={user} />
        <div className="flex min-h-svh min-w-0 flex-1 flex-col">
          {/* No bar on wide screens: the page's controls and Tibo float in the top row. */}
          <TopBar className="bg-chrome backdrop-blur-md md:bg-transparent md:backdrop-blur-none" />
          {/* Full width: pages set their own reading width (`Page`), `/now` fills it. */}
          {/*
            Thin margins, so pages and cards fill the screen and the page shows
            only at the edges. Phones keep room at the bottom for the floating nav.
          */}
          <div className="flex w-full flex-1 flex-col px-1.5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-1.5">
            <Outlet />
          </div>
        </div>
        <MobileNav user={user} className="md:hidden" />
        <TiboFab className="md:hidden" />
      </SidebarProvider>
    </TiboProvider>
  );
}
