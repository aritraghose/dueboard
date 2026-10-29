import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ThemeSwitcher } from "@/components/theme-switcher";

/**
 * Pathless layout for the sign-in flow: `/auth` and `/onboarding`. It only
 * centers the page; each route guards itself, since they admit different
 * users (signed out vs. signed in without a username).
 */
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
