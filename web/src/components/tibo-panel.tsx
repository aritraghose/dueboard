import { ClientOnly } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TiboMark } from "@/components/tibo-mark";
import { TiboThread } from "@/components/tibo-thread";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { useIsMobile } from "@/hooks/use-mobile";
import { TiboContext, useTibo, useTiboThread } from "@/hooks/use-tibo";
import { createTiboStore, type TiboStore } from "@/lib/tibo-store";
import { cn } from "@/lib/utils";

// Tibo's floating panel and the app's one connection to Tibo. One panel per
// app, opened by the Tibo button at the top right, or on phones by swiping
// up on the bottom nav; `/inbox` shows the same thread full-page.

export function TiboProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [store] = useState(createTiboStore);
  const value = useMemo(() => ({ open, setOpen, store }), [open, store]);
  return (
    <TiboContext.Provider value={value}>
      {children}
      {/* The WebSocket lives in the browser only, for as long as the app is open. */}
      <ClientOnly>
        <TiboConnection userId={userId} store={store} />
      </ClientOnly>
      <TiboSheet open={open} onOpenChange={setOpen} />
    </TiboContext.Provider>
  );
}

/**
 * Connects to the user's `TiboAgent` and feeds the store. The web stack's
 * `/agents/*` proxy pins the instance to the signed-in user whatever name is
 * sent; this one just matches it. `useAgent` reconnects by itself, and the
 * agent sends the latest history on every connect.
 */
function TiboConnection({ userId, store }: { userId: string; store: TiboStore }) {
  const socket = useRef<{ send: (data: string) => void } | null>(null);
  const agent = useAgent({
    agent: "TiboAgent",
    name: userId,
    onOpen: () => store.attach(socket.current),
    onClose: () => store.attach(null),
    onMessage: (event: MessageEvent) => store.receiveRaw(event.data),
  });
  socket.current = agent;

  // A fresh load learns from the usage RPC whether the month is used up;
  // a charged turn refreshes that RPC, so Settings agrees.
  const { usage, refresh } = useAiUsage();
  useEffect(() => {
    if (usage) store.syncUsage(usage.remaining, usage.limit);
  }, [store, usage]);
  useEffect(() => {
    store.onCharged(refresh);
    return () => store.onCharged(undefined);
  }, [store, refresh]);
  return null;
}

/** Tibo said something you haven't seen (`--tibo-unread`). */
function UnreadDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 rounded-full bg-tibo-unread ring-2 ring-background", className)}
    />
  );
}

export function TiboButton() {
  const { open, setOpen } = useTibo();
  const { unread } = useTiboThread();
  // Each click turns Tibo's rings at once.
  const [spins, setSpins] = useState(0);
  return (
    <Button
      className="relative h-8 gap-1.5 rounded-full bg-tibo pr-3 pl-1.5 text-tibo-foreground shadow-sm hover:bg-tibo/85 max-sm:pr-1.5"
      aria-label={unread ? "Open Tibo, new message" : "Open Tibo"}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        setSpins((n) => n + 1);
        setOpen(true);
      }}
    >
      <TiboMark spin={spins} className="size-6" />
      <span className="max-sm:sr-only">Tibo</span>
      {unread && <UnreadDot className="absolute -top-0.5 -right-0.5" />}
    </Button>
  );
}

export { UnreadDot };

/**
 * Floats off the screen edge with rounded corners. On wide screens it grows
 * out of the Tibo button at the top right (`[data-tibo-panel]` in
 * styles.css); on phones it rises from the bottom.
 */
function TiboSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        showCloseButton={false}
        data-tibo-panel=""
        className={
          "gap-0 overflow-hidden rounded-3xl border p-0 shadow-xl " +
          "data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-md " +
          "data-[side=bottom]:inset-x-2 data-[side=bottom]:bottom-[calc(0.5rem+env(safe-area-inset-bottom))] data-[side=bottom]:h-[min(85dvh,44rem)]"
        }
      >
        <SheetTitle className="sr-only">Tibo</SheetTitle>
        <SheetDescription className="sr-only">Chat with Tibo, your planning friend.</SheetDescription>
        {isMobile && (
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30" />
        )}
        <ClientOnly fallback={<PanelLoading />}>
          <TiboThread
            className="h-full min-h-0 flex-1 bg-popover"
            onNavigate={() => onOpenChange(false)}
            headerEnd={
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close Tibo">
                  <XIcon />
                </Button>
              </SheetClose>
            }
          />
        </ClientOnly>
      </SheetContent>
    </Sheet>
  );
}

function PanelLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner />
    </div>
  );
}
