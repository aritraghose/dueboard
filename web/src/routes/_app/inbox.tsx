import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { NotificationsButton } from "@/components/notifications-button";
import { TiboThread } from "@/components/tibo-thread";

/**
 * Tibo, full-page: the same thread as the side panel. It fills the whole
 * space with no card behind it, and the top row is off: the notifications
 * bell sits in the thread's own header.
 */
export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox · Dueboard" }] }),
  staticData: { topBar: { tibo: false, notifications: false } },
  component: Inbox,
});

function Inbox() {
  // The whole screen, less the thin top margin and the page's bottom padding
  // (on phones, the floating nav's room).
  const height = "h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]";

  return (
    <main className="flex flex-1 flex-col pt-1.5">
      <h1 className="sr-only">Inbox</h1>
      {/* The thread comes over Tibo's WebSocket, so it renders in the browser only. */}
      <ClientOnly fallback={<div className={height} />}>
        <TiboThread className={`${height} min-h-96 text-foreground`} headerEnd={<NotificationsButton />} />
      </ClientOnly>
    </main>
  );
}
