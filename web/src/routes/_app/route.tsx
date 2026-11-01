import { useAtomSet } from "@effect/atom-react";
import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import * as Exit from "effect/Exit";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { authClient } from "../../auth-client.ts";
import { ApiClient } from "../../rpc-client.ts";
import { getSessionUser } from "../../session.ts";

/**
 * Pathless layout for the main app. Every route in `_app/` keeps its own
 * path (`_app/now.tsx` is `/now`) but only renders for signed-in users
 * who finished onboarding. The API enforces the same rule on every RPC.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    if (!user.username) throw redirect({ to: "/onboarding" });
    return { user: { ...user, username: user.username } };
  },
  component: AppLayout,
});

const bootstrapAtom = ApiClient.mutation("Bootstrap");

/**
 * Runs `Bootstrap` once per app load with the browser's time zone: it
 * creates the user's settings and system tags if they're missing and keeps
 * the stored zone in step with where the user is.
 */
function useBootstrap() {
  const bootstrap = useAtomSet(bootstrapAtom, { mode: "promiseExit" });
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void bootstrap({ payload: { timeZone }, reactivityKeys: ["settings", "tags"] }).then(
      (exit) => {
        if (Exit.isFailure(exit)) toast.error("Couldn't load your settings. Try reloading.");
      },
    );
  }, [bootstrap]);
}

function AppLayout() {
  const { user } = Route.useRouteContext();
  const [signingOut, setSigningOut] = useState(false);
  useBootstrap();

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    // A full page load also drops every cached query atom of this user.
    window.location.assign("/");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-12">
      <header className="mb-12 flex items-center gap-3">
        <Link to="/now" className="font-heading font-semibold tracking-tight">
          Dueboard
        </Link>
        <ThemeSwitcher className="ml-auto" />
        <Avatar size="sm">
          {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{user.username.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">@{user.username}</span>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </header>
      <Outlet />
    </div>
  );
}
