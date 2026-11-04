import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ThemeSwitcher } from "@/components/theme-switcher";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <ThemeSwitcher className="fixed top-4 right-4 z-50" />
      <Outlet />
    </main>
  );
}
