import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { lastCheckedUser, rememberCheckedUser } from "@/lib/session-cache";
import { readSidebarOpen } from "@/lib/sidebar-state";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ cause }) => {
    const checked = lastCheckedUser();
    if (cause === "stay" && checked) return { user: checked, sidebarOpen: readSidebarOpen() };
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    if (!user.username) throw redirect({ to: "/onboarding" });
    const onboarded = { ...user, username: user.username };
    rememberCheckedUser(onboarded);
    return { user: onboarded, sidebarOpen: readSidebarOpen() };
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
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
