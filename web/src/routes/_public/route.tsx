import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_public")({
  beforeLoad: async () => ({
    user: await getSessionUser().catch(() => null),
  }),
  component: PublicLayout,
});

function PublicLayout() {
  const { user } = Route.useRouteContext();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
        >
          <AppLogo className="size-7" />
          Dueboard
        </Link>
        <ThemeSwitcher className="ml-auto" />
        {user ? (
          <Button asChild size="sm">
            <Link to={user.username ? "/now" : "/onboarding"}>Open Dueboard</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        )}
      </header>
      <Outlet />
    </div>
  );
}
