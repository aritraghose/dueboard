import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppLogo } from "@/components/app-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

export function PublicFrame({ children }: { children: ReactNode }) {
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
        <Button asChild size="sm" variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-1.5 pb-8">{children}</div>
    </div>
  );
}
