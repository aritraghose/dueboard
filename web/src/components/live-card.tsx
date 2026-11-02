import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { PanelRightCloseIcon } from "lucide-react";
import { useId } from "react";
import { CompactNoteComposer } from "@/components/note-composer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { notesForDayAtom } from "@/hooks/use-notes";
import type { LocalDate } from "@/lib/dates";
import { noteCount } from "@/lib/notes";

// Live: the feed of what you and your connections get done (it was called
// the timeline before). A card on `/now` and the whole of `/live`; the feed
// itself is built in step 14. The note box writes today's notes.

/**
 * The Live card: the feed, and a note box under it. `onCollapse` adds the
 * collapse button at the top left (on `/now`, wide screens only).
 */
export function LiveCard({
  onCollapse,
  className,
}: {
  onCollapse?: () => void;
  className?: string;
}) {
  const headingId = useId();
  const today = useToday(useTimeZone());
  return (
    <Card aria-labelledby={headingId} role="region" className={className}>
      <CardHeader className="grid grid-cols-[1fr_auto_1fr] items-center border-b">
        {onCollapse ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="justify-self-start max-md:invisible"
            aria-label="Collapse Live"
            onClick={onCollapse}
          >
            <PanelRightCloseIcon />
          </Button>
        ) : (
          <span />
        )}
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          Live
        </h2>
        <span />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 items-center justify-center">
          <p className="max-w-xs py-4 text-center text-sm text-muted-foreground">
            What you and your connections get done shows up here as it happens.
          </p>
        </div>
        <CompactNoteComposer today={today} footer={today && <TodayNotes today={today} />} />
      </CardContent>
    </Card>
  );
}

/** Today's notes count under the note box, once there is one; it opens `/notes`. */
function TodayNotes({ today }: { today: LocalDate }) {
  const result = useAtomValue(notesForDayAtom(today));
  const count = AsyncResult.isSuccess(result) ? result.value.notes.length : 0;
  if (count === 0) return null;
  return (
    <Link
      to="/notes"
      className="self-center rounded-sm px-1 text-xs text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {noteCount(count)} today
    </Link>
  );
}
