import type { ActivityKind, DiaryDay, DiaryEntry, LocalDate } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  BookOpenIcon,
  ListChecksIcon,
  NotebookPenIcon,
  RepeatIcon,
  TargetIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PageEmpty } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { diaryAtom } from "@/hooks/use-diary";
import { useSocialActions } from "@/hooks/use-social";
import { formatDay, formatDayLong, relativeDay } from "@/lib/dates";
import { PRIVACY_ICON } from "@/lib/notes";
import { PRIVACY_LABEL } from "@/lib/privacy";

// A diary (`/diary`, and under the graph on `/@username`): the owner's days,
// newest first, each a card with its entries grouped by type and timed.
// What a viewer may see is decided by `GetDiary`; the owner also sees each
// non-public entry's privacy.

type Group = "tasks" | "habits" | "goals" | "sessions" | "notes";

const GROUPS: { key: Group; label: string; icon: LucideIcon }[] = [
  { key: "tasks", label: "Tasks", icon: ListChecksIcon },
  { key: "habits", label: "Habits", icon: RepeatIcon },
  { key: "goals", label: "Goals", icon: TargetIcon },
  { key: "sessions", label: "Focus sessions", icon: TimerIcon },
  { key: "notes", label: "Notes", icon: NotebookPenIcon },
];

const GROUP_OF: Partial<Record<ActivityKind, Group>> = {
  task_settled: "tasks",
  habit_completed: "habits",
  goal_progressed: "goals",
  goal_completed: "goals",
  session_completed: "sessions",
  session_stopped: "sessions",
  note_created: "notes",
};

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** What happened, beside the title: "Reached 40%", "Stopped after 12 min". */
const entryDetail = ({ kind, meta }: DiaryEntry): string | null => {
  switch (kind) {
    case "habit_completed":
      return "Goal met";
    case "goal_progressed":
      if (meta.percent === null) return "Moved";
      return meta.rose === false ? `Moved back to ${meta.percent}%` : `Reached ${meta.percent}%`;
    case "goal_completed":
      return "Completed";
    case "session_completed":
      return meta.minutes === null ? "Completed" : `${meta.minutes} min`;
    case "session_stopped":
      if (meta.minutes === null) return "Stopped";
      return meta.minutes < 1 ? "Stopped within a minute" : `Stopped after ${meta.minutes} min`;
    default:
      return null;
  }
};

const FALLBACK_TITLE: Partial<Record<ActivityKind, string>> = {
  session_completed: "Focus session",
  session_stopped: "Focus session",
};

export function DiaryView({
  username,
  self,
  today,
  from,
  onShowLatest,
}: {
  username: string;
  /** The viewer owns this diary. */
  self: boolean;
  today: LocalDate;
  /** Start on this day (or the nearest earlier one with entries). */
  from: LocalDate | null;
  onShowLatest: () => void;
}) {
  // Back to one page whenever the starting day changes.
  const [paging, setPaging] = useState({ from, pages: 1 });
  const pages = paging.from === from ? paging.pages : 1;
  const result = useAtomValue(diaryAtom({ username, from, pages }));
  const { reload } = useSocialActions();
  // Keep the pages already shown while the next one loads (not across a jump).
  const last = useRef<{ from: LocalDate | null; days: readonly DiaryDay[]; nextCursor: LocalDate | null } | undefined>(undefined);
  if (AsyncResult.isSuccess(result)) last.current = { from, ...result.value };
  const data = last.current?.from === from ? last.current : undefined;
  const loading = !AsyncResult.isSuccess(result);
  const loadMore = () => setPaging({ from, pages: pages + 1 });

  // A jump scrolls the diary into view once the day has loaded.
  const top = useRef<HTMLDivElement>(null);
  const jumped = data !== undefined && from !== null;
  useEffect(() => {
    if (jumped) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumped, from]);

  // Older days load as the end of the list comes into view.
  const end = useRef<HTMLDivElement>(null);
  const canLoadMore = Boolean(data?.nextCursor) && !loading;
  useEffect(() => {
    const node = end.current;
    if (!node || !canLoadMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "400px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  });

  const jumpBar = from && (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl bg-secondary px-4 py-2.5 text-sm">
      <p className="text-secondary-foreground">
        {data && data.days[0] && data.days[0].date !== from
          ? `Nothing to show on ${formatDay(from, today)}. Earlier days follow.`
          : `Showing ${formatDay(from, today)} and earlier.`}
      </p>
      <Button variant="ghost" size="sm" className="-my-1 -mr-2" onClick={onShowLatest}>
        Show latest
      </Button>
    </div>
  );

  let body;
  if (!data) {
    body = AsyncResult.isFailure(result) ? (
      <PageEmpty icon={BookOpenIcon} title="Couldn't load the diary" description="Check your connection, then try again." className="min-h-48 flex-none rounded-xl border">
        <Button variant="outline" onClick={() => void reload()}>
          Try again
        </Button>
      </PageEmpty>
    ) : (
      <DiarySkeleton />
    );
  } else if (data.days.length === 0) {
    body = (
      <PageEmpty
        icon={BookOpenIcon}
        title={from ? "Nothing on or before this day" : self ? "Your diary is empty" : "Nothing to show yet"}
        description={
          self
            ? "Settled tasks, met habit goals, goal progress, finished sessions and notes collect here, one day at a time."
            : "When they get things done that you're allowed to see, their days show here."
        }
        className="min-h-48 flex-none rounded-xl border border-dashed"
      />
    );
  } else {
    body = (
      <>
        {data.days.map((day) => (
          <DiaryDayCard key={day.date} day={day} today={today} self={self} />
        ))}
        <div ref={end} />
        {data.nextCursor ? (
          <Button variant="outline" className="self-center" disabled={loading} onClick={loadMore}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        ) : (
          <p className="self-center text-sm text-muted-foreground">That's the start of the diary.</p>
        )}
      </>
    );
  }

  return (
    <div ref={top} className="flex scroll-mt-20 flex-col gap-4">
      {jumpBar}
      {body}
    </div>
  );
}

function DiaryDayCard({ day, today, self }: { day: DiaryDay; today: LocalDate; self: boolean }) {
  const relative = relativeDay(day.date, today);
  const near = relative === "Today" || relative === "Yesterday";
  const groups = GROUPS.map((group) => ({
    ...group,
    entries: day.entries.filter((entry) => GROUP_OF[entry.kind] === group.key),
  })).filter((group) => group.entries.length > 0);

  return (
    <section aria-label={formatDayLong(day.date)} className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 px-1">
        <span className="font-semibold">{formatDay(day.date, today)}</span>
        {near && <span className="text-sm text-muted-foreground">{relative}</span>}
      </h3>
      <div className="flex flex-col rounded-xl border bg-card shadow-(--card-shadow)">
        {groups.map(({ key, label, icon: Icon, entries }) => (
          <div key={key} className="flex flex-col border-t px-4 pt-3 pb-1.5 first:border-t-0">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
              <span className="tabular-nums">{entries.length}</span>
            </h4>
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <DiaryRow key={entry.id} entry={entry} self={self} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiaryRow({ entry, self }: { entry: DiaryEntry; self: boolean }) {
  const detail = entryDetail(entry);
  const PrivacyIcon = PRIVACY_ICON[entry.privacy];
  return (
    <li className="grid grid-cols-[4.25rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
      <time dateTime={entry.occurredAt.toISOString()} className="text-sm text-muted-foreground tabular-nums">
        {timeFormat.format(entry.occurredAt)}
      </time>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="min-w-0 break-words">{entry.title ?? FALLBACK_TITLE[entry.kind] ?? "Untitled"}</span>
        {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
        {/* Only the owner sees who else can see it; others only get what they may see. */}
        {self && entry.privacy !== "public" && (
          <span
            className="inline-flex items-center gap-1 self-center text-xs text-muted-foreground"
            title={`Who can see it: ${PRIVACY_LABEL[entry.privacy]}`}
          >
            <PrivacyIcon className="size-3" />
            <span className="sr-only">{PRIVACY_LABEL[entry.privacy]}</span>
          </span>
        )}
      </div>
    </li>
  );
}

function DiarySkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="mx-1 h-5 w-28" />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        {[55, 40, 65].map((width) => (
          <div key={width} className="flex items-center gap-3">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
