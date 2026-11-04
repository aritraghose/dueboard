import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { CodeXml } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "@/lib/seo";
import { getSessionUser } from "../../session.ts";

export const Route = createFileRoute("/_public")({
  beforeLoad: async () => ({
    user: await getSessionUser().catch(() => null),
  }),
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 rounded-lg text-lg font-semibold tracking-tight">
          <AppLogo className="size-7" />
          Dueboard
        </Link>
        <Button asChild size="lg" variant="ghost" className="ml-auto rounded-full px-3">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <CodeXml data-icon="inline-start" aria-hidden="true" />
            GitHub
          </a>
        </Button>
        <ThemeSwitcher />
      </header>
      <Outlet />
    </div>
  );
}
