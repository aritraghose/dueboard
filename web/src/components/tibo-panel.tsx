import { ClientOnly } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AgentChat } from "@/components/agent-chat";
import { TiboMark } from "@/components/tibo-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { TiboContext, useTibo } from "@/hooks/use-tibo";

// Tibo's floating panel. One panel per app, opened by the Tibo button at
// the top right, or on phones by swiping up on the bottom nav. Until step 17
// it hosts the demo `AgentChat`; `/inbox` shows the same chat full-page.

export function TiboProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <TiboContext.Provider value={value}>
      {children}
      <TiboSheet userId={userId} open={open} onOpenChange={setOpen} />
    </TiboContext.Provider>
  );
}

export function TiboButton() {
  const { open, setOpen } = useTibo();
  return (
    <Button
      className="h-8 gap-1.5 rounded-full bg-tibo pr-3 pl-1.5 text-tibo-foreground shadow-sm hover:bg-tibo/85 max-sm:pr-1.5"
      aria-label="Open Tibo"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      {/* A lighter face than the marigold button behind it, in both themes. */}
      <TiboMark className="size-6 [&_path:first-child]:fill-white/55" />
      <span className="max-sm:sr-only">Tibo</span>
    </Button>
  );
}

/**
 * Floats off the screen edge with rounded corners. On wide screens it grows
 * out of the Tibo button at the top right (`[data-tibo-panel]` in
 * styles.css); on phones it rises from the bottom.
 */
function TiboSheet({
  userId,
  open,
  onOpenChange,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
        {/* The chat opens a WebSocket, so it renders in the browser only. */}
        <ClientOnly fallback={<PanelLoading />}>
          <AgentChat
            userId={userId}
            className="h-full min-h-0 flex-1 rounded-none border-0 bg-popover"
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
