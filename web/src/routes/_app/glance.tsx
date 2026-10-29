import { createFileRoute } from "@tanstack/react-router";

/** Where users land after signing in (and after onboarding). */
export const Route = createFileRoute("/_app/glance")({
  head: () => ({ meta: [{ title: "Glance · Dueboard" }] }),
  component: Glance,
});

function Glance() {
  const { user } = Route.useRouteContext();

  return (
    <main className="flex flex-col gap-2">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Hi, {user.name}</h1>
      <p className="text-muted-foreground">Everything that's due, on one board.</p>
    </main>
  );
}
