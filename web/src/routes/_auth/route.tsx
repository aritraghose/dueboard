import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { AppLogo } from "@/components/app-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 rounded-lg text-lg font-semibold tracking-tight">
          <AppLogo className="size-7" />
          Dueboard
        </Link>
        <ThemeSwitcher className="ml-auto" />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-6 pb-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
        <Outlet />
      </main>
    </div>
  );
}
