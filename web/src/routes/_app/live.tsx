import { createFileRoute } from "@tanstack/react-router";
import { SessionIndicator } from "@/components/focus-session";
import { LiveCard } from "@/components/live-card";
import { NotificationsButton } from "@/components/notifications-button";
import { TiboButton } from "@/components/tibo-panel";

/** Live, full-page: what you and your connections get done, as it happens. */
export const Route = createFileRoute("/_app/live")({
  head: () => ({ meta: [{ title: "Live · Dueboard" }] }),
  // Tibo, the bell and the session timer sit in the card's header, so no top row
  // pushes the page down.
  staticData: { topBar: { tiboInPage: true, session: false, notifications: false } },
  component: Live,
});

function Live() {
  return (
    // A fixed height (like `/inbox`'s, with no top row), so the feed scrolls
    // inside the card (and loads older events as it does) with the note box in view.
    <main className="flex min-h-96 flex-col h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]">
      <LiveCard
        days={7}
        className="min-h-0 flex-1 rounded-2xl [--card-spacing:--spacing(5)]"
        headerEnd={
          <>
            <SessionIndicator />
            <NotificationsButton />
            {/* Phones have the floating Tibo button. */}
            <div className="flex max-md:hidden">
              <TiboButton />
            </div>
          </>
        }
      />
    </main>
  );
}
