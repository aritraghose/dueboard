import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
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
    <main className="page">
      <div className="account">
        {user.image ? (
          <img className="avatar" src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar" aria-hidden="true">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="account-name">@{user.username}</span>
        <button type="button" className="button-ghost" onClick={signOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <header className="hero">
        <h1 className="title">Dueboard</h1>
        <p className="subtitle">Everything that's due, on one board.</p>
      </header>
    </main>
  );
}
