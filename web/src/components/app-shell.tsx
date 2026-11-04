import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SessionSync } from "@/components/focus-session";
import { MobileNav } from "@/components/mobile-nav";
import { TiboFab } from "@/components/tibo-fab";
import { TiboProvider } from "@/components/tibo-panel";
import { TopBar } from "@/components/top-bar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useRunBootstrap } from "@/hooks/use-bootstrap";
import { NotificationsSync } from "@/hooks/use-notifications";
import type { OnboardedUser } from "@/lib/session-cache";

export function AppShell({
  user,
  sidebarOpen,
  children,
}: {
  user: OnboardedUser;
  sidebarOpen: boolean;
  children: ReactNode;
}) {
  useRunBootstrap();

  return (
    <TiboProvider userId={user.id}>
      <SessionSync />
      <NotificationsSync />
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar user={user} />
        <div className="flex min-h-svh min-w-0 flex-1 flex-col">
          <TopBar className="bg-chrome backdrop-blur-md md:bg-transparent md:backdrop-blur-none" />
          <div className="flex w-full flex-1 flex-col px-1.5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-1.5">
            {children}
          </div>
        </div>
        <MobileNav user={user} className="md:hidden" />
        <TiboFab className="md:hidden" />
      </SidebarProvider>
    </TiboProvider>
  );
}
