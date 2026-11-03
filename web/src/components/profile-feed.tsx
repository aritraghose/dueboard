import type { ActivityKind, LocalDate, ProfileFeed as Feed, ProfileItem } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  BookOpenIcon,
  CheckIcon,
  ListChecksIcon,
  NotebookPenIcon,
  RepeatIcon,
  TargetIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { PageEmpty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { profileItemsAtom, useSocialActions } from "@/hooks/use-social";
import { PRIVACY_ICON } from "@/lib/notes";
import { PRIVACY_LABEL } from "@/lib/privacy";

// A profile tab's list: the owner's completed items (and notes, in the
// diary) the viewer may see, newest first, grouped by day.

const KIND: Partial<Record<ActivityKind, { icon: LucideIcon; verb: string; fallback: string }>> = {
  task_settled: { icon: ListChecksIcon, verb: "Settled a task", fallback: "A task" },
  habit_completed: { icon: RepeatIcon, verb: "Met a habit goal", fallback: "A habit" },
  goal_completed: { icon: TargetIcon, verb: "Completed a goal", fallback: "A goal" },
  session_completed: { icon: TimerIcon, verb: "Finished a focus session", fallback: "Focus session" },
  note_created: { icon: NotebookPenIcon, verb: "Wrote a note", fallback: "A note" },
};

const EMPTY: Record<Feed, { icon: LucideIcon; self: string; other: string }> = {
  tasks: { icon: ListChecksIcon, self: "Tasks you settle show here.", other: "No settled tasks to show." },
  habits: { icon: RepeatIcon, self: "Habit goals you meet show here.", other: "No completed habits to show." },
  goals: { icon: TargetIcon, self: "Goals you complete show here.", other: "No completed goals to show." },
  sessions: { icon: TimerIcon, self: "Focus sessions you finish show here.", other: "No finished sessions to show." },
  diary: { icon: BookOpenIcon, self: "What you get done and your notes show here, day by day.", other: "Nothing to show yet." },
};

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "Tue, Nov 3, 2026" for a local date, read as that calendar day. */
const formatLocalDay = (date: LocalDate) => dayFormat.format(new Date(`${date}T12:00:00`));

export function ProfileFeed({ username, feed, self }: { username: string; feed: Feed; self: boolean }) {
  const [pages, setPages] = useState(1);
  const result = useAtomValue(profileItemsAtom({ username, feed, pages }));
  const { reload } = useSocialActions();
  // Keep showing the pages already loaded while the next one arrives.
  const last = useRef<{ items: readonly ProfileItem[]; nextCursor: string | null } | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = result.value;
  const data = last.current;

  if (!data) {
    if (AsyncResult.isFailure(result)) {
      return (
        <PageEmpty icon={EMPTY[feed].icon} title="Couldn't load this tab" description="Check your connection, then try again." className="min-h-48 flex-none rounded-xl border">
          <Button variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </PageEmpty>
      );
    }
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-hidden="true">
        {[60, 45, 70].map((width) => (
          <div key={width} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <PageEmpty
        icon={EMPTY[feed].icon}
        title="Nothing here yet"
        description={self ? EMPTY[feed].self : EMPTY[feed].other}
        className="min-h-48 flex-none rounded-xl border border-dashed"
      />
    );
  }

  const days: { date: LocalDate; items: ProfileItem[] }[] = [];
  for (const item of data.items) {
    const day = days.at(-1);
    if (day?.date === item.localDate) day.items.push(item);
    else days.push({ date: item.localDate, items: [item] });
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.date} aria-label={formatLocalDay(day.date)} className="flex flex-col gap-1.5">
          <h3 className="px-1 text-sm font-medium text-muted-foreground">{formatLocalDay(day.date)}</h3>
          <ul className="divide-y rounded-xl border bg-card px-4 shadow-(--card-shadow)">
            {day.items.map((item) => (
              <FeedRow key={item.id} item={item} self={self} />
            ))}
          </ul>
        </section>
      ))}
      {data.nextCursor && (
        <Button
          variant="outline"
          className="self-center"
          disabled={!AsyncResult.isSuccess(result)}
          onClick={() => setPages((count) => count + 1)}
        >
          {AsyncResult.isSuccess(result) ? "Load more" : "Loading…"}
        </Button>
      )}
    </div>
  );
}

function FeedRow({ item, self }: { item: ProfileItem; self: boolean }) {
  const kind = KIND[item.kind] ?? { icon: CheckIcon, verb: "Done", fallback: "Something" };
  const Icon = kind.icon;
  const PrivacyIcon = PRIVACY_ICON[item.privacy];
  const note = item.kind === "note_created";
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="break-words">{note ? item.title : (item.title ?? kind.fallback)}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{kind.verb}</span>
          {item.plannedMinutes !== null && <span>{item.plannedMinutes} min</span>}
          <time dateTime={item.occurredAt.toISOString()}>{timeFormat.format(item.occurredAt)}</time>
          {/* Only the owner sees who else can see it; others only get what they may see. */}
          {self && item.privacy !== "public" && (
            <span className="inline-flex items-center gap-1" title={`Who can see it: ${PRIVACY_LABEL[item.privacy]}`}>
              <PrivacyIcon className="size-3.5" />
              {PRIVACY_LABEL[item.privacy]}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
