import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { NotificationsButton } from "@/components/notifications-button";
import { TiboSide } from "@/components/tibo-side";
import { TiboThread } from "@/components/tibo-thread";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inbox")({
  head: () => ({ meta: [{ title: "Inbox · Dueboard" }] }),
  staticData: { topBar: { tibo: false, notifications: false } },
  component: Inbox,
});

const SIDE_KEY = "dueboard:tibo-side";

function useSideOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = React.useState(() => {
    try {
      return window.localStorage.getItem(SIDE_KEY) === "open";
    } catch {
      return false;
    }
  });
  const set = React.useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(SIDE_KEY, next ? "open" : "closed");
    } catch {
    }
  }, []);
  return [open, set];
}

function Inbox() {
  const height = "h-[calc(100dvh-6.375rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-0.75rem)]";

  return (
    <main className="flex flex-1 flex-col pt-1.5">
      <h1 className="sr-only">Inbox</h1>
      <ClientOnly fallback={<div className={height} />}>
        <InboxSplit className={height} />
      </ClientOnly>
    </main>
  );
}

function InboxSplit({ className }: { className: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useSideOpen();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const expanded = isMobile ? sheetOpen : open;
  const toggle = () => (isMobile ? setSheetOpen(!sheetOpen) : setOpen(!open));
  const label = expanded ? "Hide what Tibo is doing" : "Show what Tibo is doing";

  return (
    <div className={cn("relative flex min-h-96", className)}>
      <TiboThread
        fullPage
        className="h-full min-w-0 flex-1 text-foreground"
        headerEnd={[
          <NotificationsButton key="notifications" />,
          <button
            key="tibo-side"
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls={isMobile ? undefined : "tibo-side"}
            aria-label={label}
            title={label}
            className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {expanded && !isMobile ? <ChevronRightIcon className="size-[1.125rem]" /> : <ChevronLeftIcon className="size-[1.125rem]" />}
          </button>,
        ]}
        onTiboClick={toggle}
        tiboExpanded={expanded}
      />
      {!isMobile && open && (
        <>
          <div aria-hidden="true" className="w-px shrink-0 bg-tibo-side-border" />
          <aside
            id="tibo-side"
            aria-label="What Tibo is doing"
            className="flex h-full w-[22rem] shrink-0 flex-col bg-card animate-in fade-in-0 slide-in-from-right-4 motion-reduce:animate-none lg:w-96"
          >
            <TiboSide className="h-full" />
          </aside>
        </>
      )}
      {isMobile && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:w-[90%]">
            <SheetTitle className="sr-only">What Tibo is doing</SheetTitle>
            <SheetDescription className="sr-only">Tibo's current activity, shared files, memories and activity log.</SheetDescription>
            <TiboSide
              className="h-full"
              trailing={
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Hide what Tibo is doing"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-bubble-tibo-border bg-bubble-tibo text-foreground/80 shadow-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronRightIcon className="size-[1.125rem]" />
                </button>
              }
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
