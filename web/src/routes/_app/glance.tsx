import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgentChat } from "@/components/agent-chat";
import { authClient } from "../../auth-client.ts";

/** Where users land after signing in (and after onboarding). */
export const Route = createFileRoute("/_app/glance")({
  head: () => ({ meta: [{ title: "Glance · Dueboard" }] }),
  component: Glance,
});

function Glance() {
  const { user } = Route.useRouteContext();

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Hi, {user.name}</h1>
        <p className="text-muted-foreground">Everything that's due, on one board.</p>
      </header>
      {/* The chat opens a WebSocket, so it renders in the browser only. */}
      <ClientOnly
        fallback={<div className="h-[min(40rem,75dvh)] rounded-xl border bg-card" />}
      >
        <AgentChat userId={user.id} />
      </ClientOnly>
      <ProfileCard />
    </main>
  );
}

// Temporary: shows the session the `_app` guard loaded, to check auth works.
// Plain elements on purpose; delete once the real app has a profile UI.
function ProfileCard() {
  const { user } = Route.useRouteContext();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/");
  };

  const details = [
    { label: "Name", value: user.name },
    { label: "Username", value: `@${user.username}` },
    { label: "Email", value: user.email },
    { label: "User ID", value: user.id },
  ];

  return (
    <section
      aria-labelledby="profile-heading"
      className="flex max-w-md flex-col gap-5 rounded-xl border bg-card p-5 text-card-foreground"
    >
      <div className="flex items-center gap-4">
        {user.image ? (
          <img
            src={user.image}
            alt=""
            referrerPolicy="no-referrer"
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-xl font-semibold">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h2 id="profile-heading" className="truncate font-semibold">
            {user.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">@{user.username}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {details.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="self-start rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}
