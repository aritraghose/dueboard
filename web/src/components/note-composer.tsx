import type { Note, Privacy } from "@dueboard/api/rpc";
import * as Exit from "effect/Exit";
import { ArrowUpIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { LiveToggle, PrivacyPill } from "@/components/privacy-controls";
import { type MenuUser, UserAvatar } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useNoteActions } from "@/hooks/use-notes";
import { failureMessage } from "@/hooks/use-tasks";
import type { LocalDate } from "@/lib/dates";
import { NOTE_BODY_MAX_LENGTH, NOTE_WARN_AT, cleanNoteBody } from "@/lib/notes";
import { PRIVACY_HINT } from "@/lib/privacy";
import { cn } from "@/lib/utils";

// Writing notes: 60 characters, for today. The compact box sits at the
// bottom of the Live card; the full composer heads `/notes` with privacy and
// Live controls.

/** Characters left, turning to the warning color for the last 10. */
export function NoteCountdown({ length, className }: { length: number; className?: string }) {
  const left = NOTE_BODY_MAX_LENGTH - length;
  return (
    <span
      aria-hidden="true"
      className={cn("text-xs tabular-nums", left <= NOTE_WARN_AT ? "text-note-limit-ink" : "text-muted-foreground", className)}
    >
      {left}
    </span>
  );
}

/**
 * A ring that fills toward the 60-character limit. For the last 10 it grows,
 * turns to the warning color and shows what's left.
 */
export function NoteRing({ length }: { length: number }) {
  const left = NOTE_BODY_MAX_LENGTH - length;
  const warn = left <= NOTE_WARN_AT;
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const share = Math.min(length / NOTE_BODY_MAX_LENGTH, 1);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid place-items-center transition-[width,height] duration-150 ease-out",
        warn ? "size-6" : "size-4.5",
        length === 0 && "opacity-50",
      )}
    >
      <svg viewBox="0 0 22 22" className="absolute inset-0 size-full -rotate-90">
        <circle cx="11" cy="11" r={radius} fill="none" strokeWidth="2" className="stroke-border" />
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
          className={cn(
            "transition-[stroke-dashoffset] duration-150 ease-out",
            warn ? "stroke-note-limit" : "stroke-note-meter",
          )}
        />
      </svg>
      {warn && <span className="text-[0.625rem] font-medium text-note-limit-ink tabular-nums">{left}</span>}
    </span>
  );
}

/** A note still on its way to the API, shown faded in today's list. */
export type PendingNote = {
  readonly key: string;
  readonly body: string;
  readonly privacy: Privacy;
  readonly shareToLive: boolean;
  /** Set once the API has answered, until the refetched list has it. */
  readonly id?: string;
};

/**
 * Posts `text` as today's note. The box clears at once and gets the text
 * back if the call fails. Returns the new note, or `null` on failure.
 */
function usePostNote(today: LocalDate | null) {
  const { create } = useNoteActions();
  return async (body: string, options: { privacy?: Privacy; shareToLive?: boolean } = {}): Promise<Note | null> => {
    if (!today) return null;
    const exit = await create({ body, date: today, ...options });
    if (Exit.isSuccess(exit)) return exit.value;
    toast.error(failureMessage(exit, "Couldn't post the note."));
    return null;
  };
}

/** The Live card's note box: 60 characters with a countdown, using the default privacy. */
export function CompactNoteComposer({ today, footer }: { today: LocalDate | null; footer?: ReactNode }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const post = usePostNote(today);
  const body = cleanNoteBody(text);

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body || posting) return;
        setPosting(true);
        setText("");
        const note = await post(body);
        setPosting(false);
        if (note) toast("Note posted.");
        else setText((current) => current || body);
      }}
    >
      <InputGroup className="rounded-full bg-background/60">
        <InputGroupInput
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={NOTE_BODY_MAX_LENGTH}
          placeholder="Post a note…"
          aria-label={`Note for today, up to ${NOTE_BODY_MAX_LENGTH} characters`}
          enterKeyHint="send"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>
            <NoteCountdown length={text.length} className="text-sm" />
          </InputGroupText>
          <InputGroupButton
            type="submit"
            variant="default"
            size="icon-xs"
            className="rounded-full"
            aria-label="Post note"
            disabled={!body || posting || !today}
          >
            {posting ? <Spinner /> : <ArrowUpIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {footer}
    </form>
  );
}

/**
 * `/notes`' composer: today's note with privacy and Live controls, starting
 * from the user's defaults. `onPending` shows the note in the list before
 * the API answers; `onSettled` gives its id (or `null` when it failed).
 */
export function NoteComposer({
  user,
  today,
  onPending,
  onSettled,
}: {
  user: MenuUser;
  today: LocalDate | null;
  onPending: (note: PendingNote) => void;
  onSettled: (key: string, id: string | null) => void;
}) {
  const settings = useBootstrap()?.settings;
  const [text, setText] = useState("");
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [shareToLive, setShareToLive] = useState<boolean | null>(null);
  const post = usePostNote(today);
  const inputId = useId();
  const hintId = useId();

  // The user's defaults, until they pick something for this note.
  const shownPrivacy = privacy ?? settings?.defaultPrivacy ?? "connections";
  const shownShare = shareToLive ?? settings?.defaultShareToLive ?? true;
  const body = cleanNoteBody(text);

  // `N` (the app's "new" key) focuses the box.
  useKeyShortcut("n", () => document.getElementById(inputId)?.focus());

  return (
    <form
      className="flex gap-3 rounded-xl border bg-card px-3.5 py-3 shadow-(--card-shadow) transition-shadow focus-within:border-ring/50"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body || !today) return;
        const key = crypto.randomUUID();
        onPending({ key, body, privacy: shownPrivacy, shareToLive: shownShare });
        setText("");
        const note = await post(body, { privacy: shownPrivacy, shareToLive: shownShare });
        onSettled(key, note?.id ?? null);
        if (!note) setText((current) => current || body);
      }}
    >
      <UserAvatar user={user} className="size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Note for today, up to {NOTE_BODY_MAX_LENGTH} characters
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={NOTE_BODY_MAX_LENGTH}
          placeholder="What happened today?"
          autoComplete="off"
          enterKeyHint="send"
          aria-describedby={hintId}
          aria-keyshortcuts="N"
          className="min-w-0 bg-transparent py-1 text-base outline-none placeholder:text-muted-foreground/60"
        />
        <p id={hintId} className="sr-only">
          {PRIVACY_HINT[shownPrivacy]}
        </p>
        <div className="flex flex-wrap items-center gap-1 border-t pt-2">
          <PrivacyPill value={shownPrivacy} onChange={setPrivacy} />
          <LiveToggle value={shownShare} onChange={setShareToLive} />
          <div className="ml-auto flex items-center gap-2.5">
            <NoteRing length={text.length} />
            <span aria-hidden="true" className="h-5 w-px bg-border" />
            <Button type="submit" size="sm" className="h-7 rounded-full px-4" disabled={!body || !today}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
