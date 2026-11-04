import type { TiboMemory, TiboMemoryKind } from "@dueboard/api/tibo";
import { CalendarCheck2, CalendarClock, Heart, Info, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTiboMemories } from "@/hooks/use-tibo-memories";
import { cn } from "@/lib/utils";

export const MEMORY_KIND: Record<TiboMemoryKind, { label: string; icon: LucideIcon }> = {
  fact: { label: "Fact", icon: Info },
  preference: { label: "Preference", icon: Heart },
  person: { label: "Person", icon: UserRound },
  event: { label: "Event", icon: CalendarCheck2 },
  plan: { label: "Plan", icon: CalendarClock },
};

/** Memories shown before "Show all". */
const MEMORIES_SHOWN = 20;

/**
 * What Tibo remembers about you: the lasting facts it picked up from your
 * chats (or was asked to keep), newest first, each with its kind and when
 * it was learned. Deleting one takes it out of Tibo's memory at once.
 * Settings → Tibo and the inbox's Memory tab both show it; `compact` stacks
 * the date under the text, for narrow places.
 */
export function TiboMemoryList({ labelledBy, compact = false }: { labelledBy?: string; compact?: boolean }) {
  const { state, remove } = useTiboMemories();
  const [showAll, setShowAll] = useState(false);
  const memories = state.status === "ready" ? state.memories : [];
  const shown = showAll ? memories : memories.slice(0, MEMORIES_SHOWN);

  const forget = async (memory: TiboMemory) => {
    if (!(await remove(memory))) toast.error("Couldn't delete that memory. Try again.");
  };

  if (state.status === "loading") {
    return (
      <ul aria-label="Loading what Tibo remembers" className="flex flex-col divide-y">
        {["w-4/5", "w-3/5", "w-2/3", "w-1/2"].map((width) => (
          <li key={width} className="flex items-start gap-3 py-3">
            <Skeleton className="size-4 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className={cn("h-3.5", width)} />
              <Skeleton className="h-3 w-24" />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  if (state.status !== "ready") {
    return <p className="py-4 text-sm text-muted-foreground">Couldn't load what Tibo remembers. Reload to try again.</p>;
  }
  if (memories.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Nothing yet. Tibo keeps what matters as you chat, or say “remember that…”.
      </p>
    );
  }
  return (
    <>
      <ul aria-labelledby={labelledBy} className="flex flex-col divide-y">
        {shown.map((memory) => {
          const { label, icon: Icon } = MEMORY_KIND[memory.kind];
          return (
            <li key={memory.id} className="flex items-start gap-3 py-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="sr-only">{label}:</span>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5",
                  !compact && "sm:flex-row sm:items-baseline sm:gap-4",
                )}
              >
                <p className="min-w-0 flex-1 text-sm">{memory.text}</p>
                <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {compact ? `${label}, since ` : "Since "}
                  {new Date(memory.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-my-1 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Delete memory: ${memory.text}`}
                onClick={() => void forget(memory)}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
      {!showAll && memories.length > MEMORIES_SHOWN && (
        <div className="py-2">
          <Button variant="ghost" size="sm" className="-mx-2.5" onClick={() => setShowAll(true)}>
            Show all {memories.length}
          </Button>
        </div>
      )}
    </>
  );
}
