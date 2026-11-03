import { LIVE_SCOPE, type LiveEvent, type LiveScope, type PathEvent } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { CheckIcon, PanelRightCloseIcon } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CompactNoteComposer } from "@/components/note-composer";
import { Segmented } from "@/components/task-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import { notesCountAtom } from "@/hooks/use-day";
import { useLiveFeed, useLivePolling, usePath } from "@/hooks/use-live";
import { useNow, useToday } from "@/hooks/use-now";
import { formatDay, formatTime, localDateOf, relativeDay, type LocalDate } from "@/lib/dates";
import { liveAction, liveRelativeTime, pathAction } from "@/lib/live";
import { noteCount } from "@/lib/notes";
import { cn } from "@/lib/utils";

// Live: the feed of what you and your connections get done (it was called
// the timeline before). A card on `/now` (the last 2 days) and the whole of
// `/live` (the last 7), with tabs: All, Connections, Me, and Path (your own
// today as one thread). Both read like a chat: newest at the bottom by the
// note box, opening there, older events loading as you scroll up.

type LiveTab = LiveScope | "path";

const TABS: readonly { readonly value: LiveTab; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "connections", label: "Connections" },
  { value: "mine", label: "Me" },
  { value: "path", label: "Path" },
];

const TAB_KEY = "dueboard-live-tab";

/** Event text, a little under the body size so more fits. */
const EVENT_TEXT = "text-[0.8125rem] leading-snug";

/**
 * The Live card: the tabs, the feed, and a note box under it. `onCollapse`
 * adds the collapse button at the top left (on `/now`, wide screens only);
 * there, phones already show "Live" on the tab that opens the card, so the
 * card's own header is left out.
 */
export function LiveCard({
  days = 2,
  onCollapse,
  headerEnd,
  className,
}: {
  /** How far back the feed reaches, today included. */
  days?: number;
  onCollapse?: () => void;
  /** The header's right corner (`/live` puts Tibo there). */
  headerEnd?: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const [tab, setTab] = useLiveTab();
  useLivePolling();
  return (
    // A compact top: the title row and the tabs share the header, with less
    // padding than other cards, so the feed gets the height.
    <Card aria-labelledby={headingId} role="region" className={cn("gap-2.5! pt-2.5!", className)}>
      <CardHeader className="flex flex-col items-stretch! gap-1.5 border-b pb-2.5!">
        <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center", onCollapse && "max-md:hidden")}>
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
          <div className="flex items-center justify-end gap-2">{headerEnd}</div>
        </div>
        <div className="flex justify-center">
          <Segmented label="Show on Live" value={tab} options={TABS} onChange={setTab} />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {!today ? (
          <div className="flex-1" />
        ) : tab === "path" ? (
          <PathThread timeZone={timeZone} />
        ) : (
          <LiveFeed days={days} scope={tab} today={today} timeZone={timeZone} />
        )}
        <CompactNoteComposer today={today} footer={today && <TodayNotes today={today} />} />
      </CardContent>
    </Card>
  );
}

/**
 * Opens at the bottom, stays there as items arrive while the viewer is at
 * the bottom (a hidden tab on phones or a resize too), and keeps the view
 * still when older items are added above (`first` changes).
 */
function useStickToBottom(scroller: RefObject<HTMLDivElement | null>, items: unknown, first: string | undefined) {
  const pinned = useRef(true);
  const fromBottom = useRef(0);
  const firstId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !items) return;
    if (pinned.current) element.scrollTop = element.scrollHeight;
    else if (first !== firstId.current) element.scrollTop = element.scrollHeight - fromBottom.current;
    firstId.current = first;
  }, [scroller, items, first]);
  const hasItems = Boolean(items);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller, hasItems]);
  return () => {
    const element = scroller.current;
    if (!element) return;
    fromBottom.current = element.scrollHeight - element.scrollTop;
    pinned.current = fromBottom.current - element.clientHeight < 24;
  };
}

function LiveFeed({
  days,
  scope,
  today,
  timeZone,
}: {
  days: number;
  scope: LiveScope;
  today: LocalDate;
  timeZone: string;
}) {
  const feed = useLiveFeed({ days, scope });
  const now = useNow(30_000);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const events = feed.events;
  const shown = events && events.length > 0 ? events : undefined;
  const onScroll = useStickToBottom(scroller, shown, shown?.at(-1)?.id);

  // Older events load when the top scrolls into view. Observing again after each change asks once more
  // while it's still in view.
  const { hasOlder, loadingOlder, loadOlder } = feed;
  const count = events?.length ?? 0;
  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;
    if (!root || !target || !hasOlder || loadingOlder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadOlder();
      },
      { root, rootMargin: "120px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasOlder, loadingOlder, loadOlder, count]);

  if (!events) return feed.failed ? <LoadFailed onRetry={feed.reload} /> : <FeedSkeleton bottom />;

  if (events.length === 0) {
    const span = days === 2 ? "today or yesterday" : `the last ${days} days`;
    if (scope !== "mine" && !feed.hasConnections) {
      return (
        <FeedMessage>
          <p>What you and your connections get done shows up here.</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/discover">Find people</Link>
          </Button>
        </FeedMessage>
      );
    }
    const text = {
      all: `Nothing on Live from ${span} yet.`,
      connections: `Nothing from your connections from ${span}.`,
      mine: `Nothing of yours on Live from ${span}.`,
    }[scope];
    return (
      <FeedMessage>
        <p>{text}</p>
      </FeedMessage>
    );
  }

  // Oldest to newest, top to bottom.
  const groups = groupByDay([...events].reverse(), timeZone);
  const end = (
    <div ref={sentinel} className="flex min-h-6 items-center justify-center text-xs text-muted-foreground">
      {loadingOlder ? (
        <Spinner />
      ) : (
        !hasOlder && (
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon className="size-3.5" />
            You are all caught up
          </span>
        )
      )}
    </div>
  );

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="-mx-(--card-spacing) min-h-0 flex-1 overflow-y-auto px-(--card-spacing) [overflow-anchor:none]"
    >
      {/* A short feed sits at the bottom, by the note box. */}
      <div className="flex min-h-full flex-col justify-end">
        {end}
        {groups.map((group) => (
          <section key={group.date} aria-label={formatDay(group.date, today)} className="flex flex-col">
            <h3 className="sticky top-0 z-10 bg-card/90 py-1.5 text-center text-xs font-medium text-muted-foreground backdrop-blur-sm">
              {dayLabel(group.date, today)}
            </h3>
            <ol className="flex flex-col gap-0.5 pb-2">
              {group.events.map((event) => (
                <LiveRow key={event.id} event={event} today={group.date === today} now={now} timeZone={timeZone} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

/** "Today", "Yesterday", then "Sun, Nov 1". */
const dayLabel = (date: LocalDate, today: LocalDate) => {
  const relative = relativeDay(date, today);
  return relative === "Today" || relative === "Yesterday" ? relative : formatDay(date, today);
};

/** Events by day in the viewer's zone, in the order given. */
const groupByDay = (events: readonly LiveEvent[], timeZone: string) => {
  const groups: { date: LocalDate; events: LiveEvent[] }[] = [];
  for (const event of events) {
    const date = localDateOf(event.occurredAt, timeZone);
    const group = groups.at(-1);
    if (group?.date === date) group.events.push(event);
    else groups.push({ date, events: [event] });
  }
  return groups;
};

function LiveRow({
  event,
  today,
  now,
  timeZone,
}: {
  event: LiveEvent;
  today: boolean;
  now: Date | null;
  timeZone: string;
}) {
  const { actor } = event;
  const time = formatTime(event.occurredAt, timeZone);
  return (
    <li className="flex items-baseline gap-2.5 py-1">
      <p className={cn("min-w-0 flex-1 break-words text-muted-foreground", EVENT_TEXT)}>
        <Link
          to="/@{$username}"
          params={{ username: actor.username }}
          title={actor.name}
          data-tag={actor.color ?? "gray"}
          className="rounded-sm font-semibold text-tag-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {actor.username}
        </Link>{" "}
        {liveAction(event)}
        {event.title !== null && (
          <>
            : <span className="text-foreground">{event.title}</span>
          </>
        )}
      </p>
      <time
        dateTime={event.occurredAt.toISOString()}
        title={time}
        className="shrink-0 text-xs text-muted-foreground tabular-nums"
      >
        {today && now ? liveRelativeTime(event.occurredAt, now) : time}
      </time>
    </li>
  );
}

/**
 * The Path: what the viewer got done today, oldest first, as one thread of
 * steps on a line in their user color, each with its time.
 */
function PathThread({ timeZone }: { timeZone: string }) {
  const path = usePath();
  const color = useBootstrap()?.settings.color ?? "gray";
  const scroller = useRef<HTMLDivElement>(null);
  const events = path.events;
  const shown = events && events.length > 0 ? events : undefined;
  const onScroll = useStickToBottom(scroller, shown, shown?.[0]?.id);

  if (!events) return path.failed ? <LoadFailed onRetry={path.reload} /> : <FeedSkeleton bottom={false} />;
  if (events.length === 0) {
    return (
      <FeedMessage>
        <p>What you get done today lines up here.</p>
      </FeedMessage>
    );
  }
  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      className="-mx-(--card-spacing) min-h-0 flex-1 overflow-y-auto px-(--card-spacing)"
    >
      <ol aria-label="Your path today" data-tag={color} className="flex min-h-full flex-col justify-end py-1">
        {events.map((event) => (
          <PathStep key={event.id} event={event} timeZone={timeZone} />
        ))}
      </ol>
    </div>
  );
}

function PathStep({ event, timeZone }: { event: PathEvent; timeZone: string }) {
  return (
    <li className="group grid grid-cols-[4rem_0.75rem_1fr] gap-x-2.5">
      <time
        dateTime={event.occurredAt.toISOString()}
        className="pt-1.5 text-right text-xs text-muted-foreground tabular-nums"
      >
        {formatTime(event.occurredAt, timeZone)}
      </time>
      {/* The line runs from the first dot to the last; each step's dot sits on it. */}
      <span
        aria-hidden="true"
        className="relative before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-tag/40 group-first:before:top-2.5 group-last:before:bottom-auto group-last:before:h-2.5"
      >
        <span className="absolute top-2.5 left-1/2 size-2 -translate-1/2 rounded-full bg-tag ring-2 ring-card" />
      </span>
      <p className={cn("min-w-0 break-words py-1 pb-2.5 text-muted-foreground", EVENT_TEXT)}>
        {pathAction(event)}
        {event.title !== null && (
          <>
            : <span className="text-foreground">{event.title}</span>
          </>
        )}
      </p>
    </li>
  );
}

function FeedSkeleton({ bottom }: { bottom: boolean }) {
  return (
    <div className={cn("flex flex-1 flex-col gap-3 py-2", bottom && "justify-end")} aria-hidden="true">
      {[70, 50, 62].map((width) => (
        <Skeleton key={width} className="h-3.5" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <FeedMessage>
      <p>Live didn't load. Check your connection, then try again.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </FeedMessage>
  );
}

function FeedMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4 text-center text-sm text-muted-foreground [&>p]:max-w-xs">
      {children}
    </div>
  );
}

/** The selected tab, remembered per viewer in localStorage. Read after mount, so hydration agrees. */
function useLiveTab() {
  const [tab, setTab] = useState<LiveTab>("all");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved === "path" || (LIVE_SCOPE as readonly string[]).includes(saved ?? "")) setTab(saved as LiveTab);
    } catch {
      // Storage blocked: start on All.
    }
  }, []);
  const update = (next: LiveTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Not remembered this time.
    }
  };
  return [tab, update] as const;
}

/** Today's notes count under the note box, once there is one; it opens `/notes`. */
function TodayNotes({ today }: { today: LocalDate }) {
  const result = useAtomValue(notesCountAtom(today));
  const count = AsyncResult.isSuccess(result) ? result.value : 0;
  if (count === 0) return null;
  return (
    <Link
      to="/notes"
      className="rounded-sm px-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {noteCount(count)} today
    </Link>
  );
}
