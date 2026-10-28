import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "../auth-client.ts";
import { getSessionUser } from "../session.ts";

export const Route = createFileRoute("/")({
  // Only signed-in users who finished onboarding reach the app. The API
  // enforces the same rule on every RPC.
  beforeLoad: async () => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/sign-in" });
    if (!user.username) throw redirect({ to: "/onboarding" });
    return { user: { ...user, username: user.username } };
  },
  component: Home,
});

function Home() {
  const { user } = Route.useRouteContext();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    // A full page load also drops every cached query atom of this user.
    window.location.assign("/sign-in");
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pt-20 pb-12">
      <div className="mb-10 flex items-center justify-end gap-3">
        <Avatar size="sm">
          {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{user.username.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">@{user.username}</span>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Dueboard</h1>
        <p className="text-muted-foreground">Everything that's due, on one board.</p>
      </header>
    </main>
  );
}
