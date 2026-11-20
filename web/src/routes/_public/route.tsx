import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/app-logo";
import { GitHubMark } from "@/components/github-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_public")({
  beforeLoad: async () => ({
    user: await getSessionUser().catch(() => null),
  }),
  component: PublicLayout,
});

function PublicLayout() {
  const { user } = Route.useRouteContext();
  const destination = !user ? "/auth" : user.username ? "/now" : "/onboarding";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className="flex min-h-svh flex-col">
      <div
        className={cn(
          "sticky top-0 z-30 w-full transition-[padding] duration-300 ease-out",
          scrolled ? "px-3 pt-3 sm:px-6" : "px-4 pt-0 sm:px-6",
        )}
      >
        <header
          className={cn(
            "mx-auto flex w-full items-center gap-3 transition-all duration-300 ease-out",
            scrolled
              ? "max-w-4xl rounded-full border border-border/80 bg-chrome/90 px-5 py-3 shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl"
              : "max-w-7xl rounded-none border border-transparent bg-transparent px-0 py-4 shadow-none ring-0 ring-transparent",
          )}
        >
          <Link to="/" className="flex items-center gap-2 rounded-full pl-1 text-lg font-semibold tracking-tight">
            <AppLogo className="size-7" />
            <span>Dueboard</span>
          </Link>

          <a
            href="#features"
            className="ml-2 hidden rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground sm:inline-flex"
          >
            Features
          </a>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <Button asChild size="sm" variant="ghost" className="h-9 rounded-full px-3">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Dueboard on GitHub">
                <GitHubMark data-icon="inline-start" />
                <span className="max-sm:hidden">GitHub</span>
              </a>
            </Button>
            <ThemeSwitcher />
            <Button asChild size="sm" className="h-9 rounded-full px-4.5 shadow-xs">
              <Link to={destination}>{user ? "Open board" : "Sign in"}</Link>
            </Button>
          </div>
        </header>
      </div>
      <Outlet />
    </div>
  );
}
