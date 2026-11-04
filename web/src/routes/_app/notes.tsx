import { type Note, PRIVACY, type Privacy } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  CheckIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PencilIcon,
  RadioIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { NoteComposer, NoteCountdown, type PendingNote } from "@/components/note-composer";
import { Page, PageEmpty, PageHeader } from "@/components/page";
import { type MenuUser, UserAvatar } from "@/components/user-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { noteListAtom, useIsRemoved, useNoteActions, useOptimisticNotes } from "@/hooks/use-notes";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, formatDay, formatDayLong, formatTime, relativeDay } from "@/lib/dates";
import { NOTE_BODY_MAX_LENGTH, PRIVACY_ICON, cleanNoteBody, noteCount } from "@/lib/notes";
import { PRIVACY_LABEL } from "@/lib/privacy";
import { cn } from "@/lib/utils";

type NotesSearch = { q?: string | undefined };

const PAGE_SIZE = 50;

export const Route = createFileRoute("/_app/notes")({
  validateSearch: (search: Record<string, unknown>): NotesSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.slice(0, NOTE_BODY_MAX_LENGTH) : undefined,
  }),
  head: () => ({ meta: [{ title: "Notes · Dueboard" }] }),
  component: Notes,
});

function Notes() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = useToday(useTimeZone());
  const { user } = Route.useRouteContext();
  const [pending, setPending] = useState<readonly PendingNote[]>([]);

  const setQuery = (q: string) =>
    void navigate({ search: (current) => ({ ...current, q: q.trim() ? q : undefined }), replace: true });

  return (
    <Page>
      <PageHeader title="Notes" />
      <div className="flex w-full flex-col gap-6 pb-8">
        <NoteComposer
          user={user}
          today={today}
          onPending={(note) => setPending((list) => [...list, note])}
          onSettled={(key, id) =>
            setPending((list) =>
              id ? list.map((note) => (note.key === key ? { ...note, id } : note)) : list.filter((note) => note.key !== key),
            )
          }
        />
        <SearchField value={search.q ?? ""} onChange={setQuery} />
        {today && (
          <Results
            key={search.q ?? ""}
            query={search.q}
            today={today}
            user={user}
            pending={search.q ? [] : pending}
            onListed={(ids) => setPending((list) => list.filter((note) => !note.id || !ids.has(note.id)))}
            onClearSearch={() => setQuery("")}
          />
        )}
      </div>
    </Page>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => latest.current(text), 250);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <InputGroup className="h-8 rounded-full bg-card/60">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            event.preventDefault();
            setText("");
          }
        }}
        maxLength={NOTE_BODY_MAX_LENGTH}
        placeholder="Search notes"
        aria-label="Search notes"
      />
      {text && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setText("")}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

function Results({
  query,
  today,
  user,
  pending,
  onListed,
  onClearSearch,
}: {
  query: string | undefined;
  today: LocalDate;
  user: MenuUser;
  pending: readonly PendingNote[];
  onListed: (ids: ReadonlySet<string>) => void;
  onClearSearch: () => void;
}) {
  const [pages, setPages] = useState(1);
  const result = useAtomValue(noteListAtom({ query, pages, limit: PAGE_SIZE }));
  const { reload } = useNoteActions();
  const isRemoved = useIsRemoved();

  const last = useRef<{ days: { date: LocalDate; notes: Note[] }[]; nextCursor: string | null } | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const data = last.current;
  const loadingMore = !AsyncResult.isSuccess(result) && data !== undefined;

  const listedIds = useMemo(
    () => new Set(data?.days.flatMap((day) => day.notes.map((note) => note.id)) ?? []),
    [data],
  );
  useEffect(() => {
    if (pending.some((note) => note.id && listedIds.has(note.id))) onListed(listedIds);
  }, [pending, listedIds, onListed]);

  const allNotes = useMemo(() => data?.days.flatMap((day) => day.notes) ?? [], [data]);
  const { apply, change } = useOptimisticNotes(allNotes);

  if (!data) {
    if (AsyncResult.isFailure(result)) return <LoadFailed onRetry={() => void reload()} />;
    return <ListSkeleton />;
  }

  const waiting = pending.filter((note) => !note.id || !listedIds.has(note.id)).toReversed();
  const days = data.days
    .map((day) => ({ ...day, notes: day.notes.filter((note) => !isRemoved(note.id)).map(apply) }))
    .filter((day) => day.notes.length > 0 || (day.date === today && waiting.length > 0));
  if (waiting.length > 0 && days[0]?.date !== today) days.unshift({ date: today, notes: [] });

  if (days.length === 0) {
    return query ? (
      <PageEmpty
        icon={SearchXIcon}
        title="No notes match"
        description={`Nothing you wrote contains “${query}”.`}
        className="min-h-60"
      >
        <Button variant="outline" size="sm" onClick={onClearSearch}>
          Clear search
        </Button>
      </PageEmpty>
    ) : (
      <PageEmpty
        icon={NotebookPenIcon}
        title="No notes yet"
        description="Write one above."
        className="min-h-60"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {AsyncResult.isFailure(result) && <LoadFailed onRetry={() => void reload()} />}
      {days.map((day) => (
        <DaySection key={day.date} date={day.date} today={today} count={day.notes.length + (day.date === today ? waiting.length : 0)}>
          {day.date === today && waiting.map((note) => <PendingCard key={note.key} note={note} user={user} />)}
          {day.notes.map((note) => (
            <NoteCard key={note.id} note={note} user={user} query={query} onChange={change} />
          ))}
        </DaySection>
      ))}
      {(data.nextCursor || loadingMore) && (
        <Button
          variant="outline"
          className="self-center rounded-full"
          disabled={loadingMore}
          onClick={() => setPages((count) => count + 1)}
        >
          {loadingMore && <Spinner />}
          Load more
        </Button>
      )}
    </div>
  );
}

function DaySection({
  date,
  today,
  count,
  children,
}: {
  date: LocalDate;
  today: LocalDate;
  count: number;
  children: ReactNode;
}) {
  const relative = relativeDay(date, today);
  const named = relative === "Today" || relative === "Yesterday";
  return (
    <section aria-label={formatDayLong(date)} className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 px-1">
        <span className="font-semibold">{named ? relative : formatDay(date, today)}</span>
        {named && <span className="text-sm text-muted-foreground">{formatDay(date, today)}</span>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{noteCount(count)}</span>
      </h2>
      <ol className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-(--card-shadow)">
        {children}
      </ol>
    </section>
  );
}

function CardFrame({
  user,
  meta,
  menu,
  children,
  footer,
  className,
}: {
  user: MenuUser;
  meta: ReactNode;
  menu?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "group/note flex gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-muted/30 focus-within:bg-muted/30",
        className,
      )}
    >
      <UserAvatar user={user} className="size-8" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[0.8125rem]">
          <span className="truncate font-semibold">{user.name}</span>
          <span className="truncate text-muted-foreground">@{user.username}</span>
          <span aria-hidden="true" className="text-muted-foreground/60">
            ·
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{meta}</span>
          {menu && <span className="-my-1 ml-auto shrink-0">{menu}</span>}
        </div>
        {children}
        <div className="mt-1 flex flex-wrap items-center gap-1">{footer}</div>
      </div>
    </li>
  );
}

function PendingCard({ note, user }: { note: PendingNote; user: MenuUser }) {
  return (
    <CardFrame
      user={user}
      className="opacity-60"
      meta={
        <span className="inline-flex items-center gap-1">
          <Spinner className="size-3" />
          Posting
        </span>
      }
      footer={<NoteMarks privacy={note.privacy} shareToLive={note.shareToLive} />}
    >
      <p className="text-[0.9375rem] leading-snug break-words">{note.body}</p>
    </CardFrame>
  );
}

function NoteMarks({ privacy, shareToLive }: { privacy: Privacy; shareToLive: boolean }) {
  const Icon = PRIVACY_ICON[privacy];
  const LiveIcon = shareToLive ? RadioIcon : EyeOffIcon;
  return (
    <>
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-1.5 py-px text-[0.6875rem] text-muted-foreground">
        <Icon className="size-3" aria-hidden="true" />
        {PRIVACY_LABEL[privacy]}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[0.6875rem]",
          shareToLive ? "bg-success/10 text-success-ink" : "bg-muted/70 text-muted-foreground",
        )}
      >
        <LiveIcon className="size-3" aria-hidden="true" />
        {shareToLive ? "On Live" : "Off Live"}
      </span>
    </>
  );
}

function Highlighted({ body, query }: { body: string; query: string | undefined }) {
  const needle = query?.trim().toLowerCase();
  if (!needle) return <>{body}</>;
  const parts: ReactNode[] = [];
  const lower = body.toLowerCase();
  let at = 0;
  for (let found = lower.indexOf(needle); found !== -1; found = lower.indexOf(needle, at)) {
    if (found > at) parts.push(body.slice(at, found));
    parts.push(
      <mark key={found} className="rounded-sm bg-note-meter/20 text-inherit">
        {body.slice(found, found + needle.length)}
      </mark>,
    );
    at = found + needle.length;
  }
  parts.push(body.slice(at));
  return <>{parts}</>;
}

type NoteChange = (note: Note, patch: { body?: string; privacy?: Privacy; shareToLive?: boolean }) => Promise<Exit.Exit<unknown, unknown>>;

function NoteCard({
  note,
  user,
  query,
  onChange,
}: {
  note: Note;
  user: MenuUser;
  query: string | undefined;
  onChange: NoteChange;
}) {
  const timeZone = useTimeZone();
  const [editing, setEditing] = useState(false);
  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 1000;

  const save = async (patch: Parameters<NoteChange>[1], failed: string) => {
    const exit = await onChange(note, patch);
    if (Exit.isFailure(exit)) toast.error(failureMessage(exit, failed));
  };

  return (
    <CardFrame
      user={user}
      meta={
        <time
          dateTime={note.createdAt.toISOString()}
          title={`${formatDayLong(note.localDate)}, ${formatTime(note.createdAt, timeZone)}`}
        >
          {formatTime(note.createdAt, timeZone)}
          {edited && <span className="ml-1.5">(edited)</span>}
        </time>
      }
      menu={
        !editing && (
          <NoteMenu
            note={note}
            onEdit={() => setEditing(true)}
            onPrivacy={(privacy) => void save({ privacy }, "Couldn't change who can see the note.")}
            onShare={(shareToLive) => void save({ shareToLive }, "Couldn't change the Live setting.")}
          />
        )
      }
      footer={<NoteMarks privacy={note.privacy} shareToLive={note.shareToLive} />}
    >
      {editing ? (
        <NoteEditor
          initial={note.body}
          onCancel={() => setEditing(false)}
          onSave={(body) => {
            setEditing(false);
            if (body !== note.body) void save({ body }, "Couldn't save the note.");
          }}
        />
      ) : (
        <p className="text-[0.9375rem] leading-snug break-words" onDoubleClick={() => setEditing(true)}>
          <Highlighted body={note.body} query={query} />
        </p>
      )}
    </CardFrame>
  );
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const body = cleanNoteBody(text);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (body) onSave(body);
      }}
    >
      <InputGroup className="h-8 flex-1 rounded-lg">
        <InputGroupInput
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          maxLength={NOTE_BODY_MAX_LENGTH}
          aria-label={`Edit note, up to ${NOTE_BODY_MAX_LENGTH} characters`}
        />
        <InputGroupAddon align="inline-end">
          <NoteCountdown length={text.length} />
        </InputGroupAddon>
      </InputGroup>
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Save note" disabled={!body}>
        <CheckIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel editing" onClick={onCancel}>
        <XIcon />
      </Button>
    </form>
  );
}

function NoteMenu({
  note,
  onEdit,
  onPrivacy,
  onShare,
}: {
  note: Note;
  onEdit: () => void;
  onPrivacy: (privacy: Privacy) => void;
  onShare: (shareToLive: boolean) => void;
}) {
  const { remove } = useNoteActions();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground md:opacity-0 md:group-hover/note:opacity-100 md:group-focus-within/note:opacity-100 md:data-[state=open]:opacity-100"
            aria-label={`More for “${note.body}”`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Edit note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Who can see it</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={note.privacy} onValueChange={(value) => onPrivacy(value as Privacy)}>
            {PRIVACY.map((value) => {
              const Icon = PRIVACY_ICON[value];
              return (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon />
                  {PRIVACY_LABEL[value]}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={note.shareToLive} onCheckedChange={(checked) => onShare(checked === true)}>
            Show on Live
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              “{note.body}” will be removed, including its place in your diary and Live. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const exit = await remove(note.id);
                if (Exit.isFailure(exit)) toast.error(failureMessage(exit, "Couldn't delete the note."));
              }}
            >
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
      <p className="text-muted-foreground">Notes didn't load. Check your connection.</p>
      <Button variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading notes">
      <Skeleton className="h-5 w-40" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  );
}
