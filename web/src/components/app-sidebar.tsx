import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AppLogo } from "@/components/app-logo";
import { NavIcon } from "@/components/tibo-panel";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { type MenuUser, UserAvatar, UserMenuContent } from "@/components/user-menu";
import { BOARDS, DISCOVER_NAV, LEADERBOARD_NAV, MAIN_NAV, type NavItem, SETTINGS_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

// The `_app` navigation on wide screens, after Gemini's web app: a
// full-height icon rail that expands to labels, in its own nav color
// (`--sidebar`). Built on shadcn's sidebar-07 block. Phones get
// `mobile-nav.tsx` instead.

// Gemini's rail: slightly larger icons than shadcn's 16px, in circles while collapsed.
const railButton =
  "[&_svg]:size-[1.125rem] text-sidebar-foreground/80 data-active:text-sidebar-foreground group-data-[collapsible=icon]:rounded-full";

export function AppSidebar({ user }: { user: MenuUser }) {
  const { isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <BrandToggle />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1.5">
            {MAIN_NAV.map((item) => (
              <NavLink key={item.to} item={item}>
                {/* Boards' own pages. The sidebar hides a subsection while collapsed. */}
                {item.to === "/boards" && <BoardLinks />}
              </NavLink>
            ))}
            <NavLink item={DISCOVER_NAV} />
            <NavLink item={LEADERBOARD_NAV} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-4">
        <SidebarMenu className="gap-1.5">
          <NavLink item={SETTINGS_NAV} />
          <SidebarUserMenu user={user} />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavLink({
  item: { to, label, icon: Icon },
  children,
}: {
  item: NavItem;
  children?: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname.startsWith(to)} tooltip={label} className={railButton}>
        <Link to={to}>
          <NavIcon to={to} icon={Icon} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {children}
    </SidebarMenuItem>
  );
}

/** Tasks, Habits, Goals, Notes, Live and Diary, under Boards. */
function BoardLinks() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SidebarMenuSub className="mt-1">
      {BOARDS.map(({ to, label, icon: Icon }) => (
        <SidebarMenuSubItem key={to}>
          <SidebarMenuSubButton asChild isActive={pathname.startsWith(to)}>
            <Link to={to}>
              <Icon />
              <span>{label}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

/**
 * The top of the rail. Collapsed, it's the logo, which turns into an
 * "expand" icon on hover or focus. Expanded, it's the wordmark with a
 * collapse button. Ctrl/⌘+B toggles too.
 */
function BrandToggle() {
  const { state, toggleSidebar } = useSidebar();

  if (state === "collapsed") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Expand menu"
            onClick={toggleSidebar}
            className={cn("group/brand", railButton)}
          >
            <AppLogo className="group-hover/brand:hidden group-focus-visible/brand:hidden" />
            <ChevronRightIcon className="hidden size-[1.125rem]! group-hover/brand:block group-focus-visible/brand:block" />
            <span className="sr-only">Expand menu</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-1">
        <SidebarMenuButton asChild className="flex-1 font-semibold tracking-[-0.03em]">
          <Link to="/now">
            <AppLogo />
            <span className="text-[1.0625rem]">Dueboard</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton
          onClick={toggleSidebar}
          aria-label="Collapse menu"
          className={cn("size-8 shrink-0 justify-center", railButton)}
        >
          <ChevronLeftIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** The avatar at the bottom of the rail. */
function SidebarUserMenu({ user }: { user: MenuUser }) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            tooltip={`@${user.username}`}
            className="data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
          >
            <UserAvatar user={user} />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
            </span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <UserMenuContent user={user} side="right" align="end" sideOffset={12} />
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
