import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
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
  return (
    <AppShell user={user} sidebarOpen={sidebarOpen}>
      <Outlet />
    </AppShell>
  );
}
