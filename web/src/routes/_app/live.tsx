import { createFileRoute } from "@tanstack/react-router";
import { LiveCard } from "@/components/live-card";

/** Live, full-page: what you and your connections get done, as it happens. */
export const Route = createFileRoute("/_app/live")({
  head: () => ({ meta: [{ title: "Live · Dueboard" }] }),
  component: Live,
});

function Live() {
  return (
    <main className="flex flex-1 flex-col">
      <LiveCard className="flex-1 rounded-2xl [--card-spacing:--spacing(5)]" />
    </main>
  );
}
