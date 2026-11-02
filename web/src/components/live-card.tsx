import { ArrowUpIcon, PanelRightCloseIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

// Live: the feed of what you and your connections get done (it was called
// the timeline before). A card on `/now` and the whole of `/live`; the feed
// itself is built in step 14.

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
        <NoteComposer />
      </CardContent>
    </Card>
  );
}

/** Notes are short: 60 characters each (see planning.md, Notes). */
const NOTE_MAX_LENGTH = 60;

/** Post a short note to your day (and Live). Notes are built in step 9. */
function NoteComposer() {
  const [note, setNote] = useState("");
  const left = NOTE_MAX_LENGTH - note.length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!note.trim()) return;
        toast("Notes are on the way.");
      }}
    >
      <InputGroup className="rounded-full bg-background/60">
        <InputGroupInput
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Post a note…"
          aria-label="Note"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText className={cn("tabular-nums", left <= 10 && "text-tibo-foreground dark:text-tibo")}>
            {left}
          </InputGroupText>
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-xs"
            className="rounded-full"
            aria-label="Post note"
            disabled={!note.trim()}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
