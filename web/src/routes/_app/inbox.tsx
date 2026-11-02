import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AgentChat } from "@/components/agent-chat";

/**
 * Tibo, full-page: the same thread as the side panel. It fills the whole
 * space with no card behind it, and the top row's Tibo button is off.
 */
export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox · Dueboard" }] }),
  staticData: { topBar: { tibo: false } },
  component: Inbox,
});

function Inbox() {
  const { user } = Route.useRouteContext();
  // The whole screen, less the thin top margin and the page's bottom padding
  // (on phones, the floating nav's room).
  const height = "h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]";

  return (
    <main className="flex flex-1 flex-col pt-1.5">
      <h1 className="sr-only">Inbox</h1>
      {/* The chat opens a WebSocket, so it renders in the browser only. */}
      <ClientOnly fallback={<div className={height} />}>
        <AgentChat
          userId={user.id}
          className={`${height} min-h-96 rounded-none border-0 bg-transparent! bg-none! text-foreground`}
        />
      </ClientOnly>
    </main>
  );
}
