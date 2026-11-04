import { createFileRoute } from "@tanstack/react-router";
import { SessionIndicator } from "@/components/focus-session";
import { LiveCard } from "@/components/live-card";
import { NotificationsButton } from "@/components/notifications-button";
import { TiboButton } from "@/components/tibo-panel";

export const Route = createFileRoute("/_app/live")({
  head: () => ({ meta: [{ title: "Live · Dueboard" }] }),
  staticData: { topBar: { tiboInPage: true, session: false, notifications: false } },
  component: Live,
});

function Live() {
  return (
    <main className="flex min-h-96 flex-col h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]">
      <LiveCard
        days={7}
        className="min-h-0 flex-1 rounded-2xl [--card-spacing:--spacing(5)]"
        headerEnd={
          <>
            <SessionIndicator />
            <NotificationsButton />
            <div className="flex max-md:hidden">
              <TiboButton />
            </div>
          </>
        }
      />
    </main>
  );
}
