import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getSessionUser } from "../../session.ts";

/**
 * Pathless layout for pages anyone can visit: the landing page (`/`) and,
 * later, `/pricing`, `/about` and the like. Add them as files in `_public/`.
 *
 * The session only picks the header's call to action, so a failed lookup
 * shows the signed-out header instead of an error page.
 */
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
        <Link to="/" className="font-heading text-lg font-semibold tracking-tight">
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
