import type { Habit, Task } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { CheckCheckIcon, ChevronDownIcon, PanelRightOpenIcon, PanelTopCloseIcon, PanelTopOpenIcon, PlusIcon, RepeatIcon, TargetIcon, TimerIcon } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DayStepper, NowClock } from "@/components/day-navigator";
import { HabitDialog } from "@/components/habit-dialog";
import { DueHabits, SettledHabits } from "@/components/habit-section";
import { LiveCard } from "@/components/live-card";
import { TaskDialog } from "@/components/task-card";
import { TagChip } from "@/components/tag-chip";
import { TaskList } from "@/components/task-list";
import { ViewControls } from "@/components/view-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { useHabitDialog } from "@/hooks/use-habit-dialog";
import { type DayHabits, useDayHabits, useHabitActions } from "@/hooks/use-habits";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { tasksForDayAtom, unscheduledAtom, useOptimisticStatus, useTagMap, useTags, useTaskActions, useWithoutRemoved } from "@/hooks/use-tasks";
import { setTopBarHidden, useTopBarHidden } from "@/hooks/use-top-bar-hidden";
import { type ViewOptions, useViewOptions } from "@/hooks/use-view-options";
import { type LocalDate, formatDay, isLocalDate } from "@/lib/dates";
import { groupByTag, sortTasks } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type NowSearch = {
  /** The selected day. Absent means today in the user's time zone. */
  date?: LocalDate | undefined;
};

/**
 * Where users land after signing in: one day at a time. The day lives in
 * `?date=YYYY-MM-DD`; anything else in that param is dropped. Two cards: the
 * day (tasks, then at its bottom the Settled / Sessions / Unscheduled and
 * the habits and goals tab rows, each with a fold chevron) takes two thirds, Live (with a note box) one third,
 * and the day card takes it all when Live is collapsed. Their contents are
 * placeholders until their build steps (tasks 4, habits 6, goals 8, sessions
 * 11, Live 14) fill them.
 */
export const Route = createFileRoute("/_app/now")({
  // `date` is always set, even to `undefined`: the router merges this over
  // the raw search, so leaving the key out would let an invalid date through.
  validateSearch: (search: Record<string, unknown>): NowSearch => ({
    date: typeof search.date === "string" && isLocalDate(search.date) ? search.date : undefined,
  }),
  head: () => ({ meta: [{ title: "Now · Dueboard" }] }),
  staticData: { topBar: { start: StartSessionButton, center: TopBarClock, hideable: true } },
  component: Now,
});

/**
 * In the top row: start a focus session, on a cream pill. Once sessions
 * exist (step 11), a running session's countdown takes this button's place.
 */
function StartSessionButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full bg-cream text-cream-foreground ring-1 ring-cream-foreground/10 hover:bg-cream/80! hover:text-cream-foreground! dark:ring-0"
      onClick={() => toast("Focus sessions are on the way.")}
    >
      <TimerIcon />
      <span className="md:hidden">Start</span>
      <span className="max-md:hidden">Start a session</span>
    </Button>
  );
}

/** In the top row's center: today's date and the local time. */
function TopBarClock() {
  const timeZone = useTimeZone();
  return <NowClock today={useToday(timeZone)} timeZone={timeZone} />;
}

function Now() {
  const { date: searchDate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const date = searchDate ?? today;
  const [liveCollapsed, setLiveCollapsed] = useLiveCollapsed();
  const dialog = useTaskDialog();
  const habitDialog = useHabitDialog();
  const [view, setView] = useViewOptions("now");
  // N adds what the list shows: a habit in the Habits view, a task otherwise.
  const newItem = () => {
    if (view.show === "habits") habitDialog.openNew();
    else if (date) dialog.openNew(date);
  };
  useKeyShortcut("n", newItem);
  const topBarHidden = useTopBarHidden();

  const changeDate = useCallback(
    (next: LocalDate) => {
      // Today keeps a clean `/now`, so a bookmark always opens on the current day.
      void navigate({ search: { date: next === today ? undefined : next }, replace: true });
    },
    [navigate, today],
  );

  // "today" or "on Wed, Nov 4", to finish a sentence.
  const onDay = !date || date === today ? "today" : `on ${formatDay(date, today ?? undefined)}`;

  // Phones show the day and Live as two tabs. From `md` up both cards sit
  // side by side (two thirds and one third) and the tabs hide; a collapsed
  // Live gives the day card the full width. The page is exactly one screen
  // tall, so the day card's tab rows sit at its bottom without scrolling.
  return (
    <main
      className={cn(
        "flex min-h-96 flex-col",
        // Without the 3rem top row, the page starts a hair below the screen's top edge.
        topBarHidden
          ? "h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] pt-1.5 md:h-[calc(100dvh-0.375rem)]"
          : "h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.375rem)]",
      )}
    >
      <Tabs
        defaultValue="day"
        className={cn(
          // One stacking layer for both panes, so both glows sit under both cards.
          "isolate min-h-0 flex-1 gap-1.5 md:grid md:grid-rows-1 md:gap-1.5",
          liveCollapsed ? "md:grid-cols-1" : "md:grid-cols-3",
        )}
      >
        <TabsList className="w-full md:hidden">
          <TabsTrigger value="day">Tasks</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>

        <TabsContent value="day" forceMount className={cn(paneClass, !liveCollapsed && "md:col-span-2")}>
          <CardGlow />
          <Card className={cardClass}>
            <CardHeader className="grid grid-cols-[1fr_auto_1fr] items-start border-b">
              <Button
                variant="ghost"
                size="icon-sm"
                className="mt-1 justify-self-start text-muted-foreground"
                aria-pressed={topBarHidden}
                aria-label={topBarHidden ? "Show the top bar" : "Hide the top bar"}
                title={topBarHidden ? "Show the top bar" : "Hide the top bar"}
                onClick={() => setTopBarHidden(!topBarHidden)}
              >
                {topBarHidden ? <PanelTopOpenIcon /> : <PanelTopCloseIcon />}
              </Button>
              <DayStepper date={date} today={today} onChange={changeDate} />
              {liveCollapsed && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end max-md:hidden"
                  aria-label="Show Live"
                  onClick={() => setLiveCollapsed(false)}
                >
                  <PanelRightOpenIcon />
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
              {date && today ? (
                <DayBody
                  date={date}
                  today={today}
                  onDay={onDay}
                  view={view}
                  onViewChange={setView}
                  onOpenTask={dialog.openTask}
                  onEditHabit={habitDialog.openHabit}
                  onNew={newItem}
                />
              ) : (
                <DayBodySkeleton />
              )}
            </CardContent>
          </Card>
          {today && (
            <TaskDialog
              target={dialog.target}
              open={dialog.open}
              version={dialog.version}
              onOpenChange={dialog.setOpen}
              today={today}
            />
          )}
          {today && (
            <HabitDialog
              target={habitDialog.target}
              open={habitDialog.open}
              version={habitDialog.version}
              onOpenChange={habitDialog.setOpen}
              today={today}
            />
          )}
        </TabsContent>

        <TabsContent
          value="live"
          forceMount
          className={cn(
            "relative flex min-h-0 flex-col data-[state=inactive]:hidden",
            liveCollapsed ? "md:hidden" : "md:data-[state=inactive]:flex",
          )}
        >
          <CardGlow />
          <LiveCard className={cardClass} onCollapse={() => setLiveCollapsed(true)} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

/**
 * The day card's body: the view row (show, sort, group), the day's open
 * tasks and due habits (as the Show choice says) with New task or New habit
 * floating at their bottom right, then the Settled / Sessions / Unscheduled
 * and habits / goals tab rows. Unscheduled shows on every day, not only
 * today (planning.md, step 4 decision).
 */
function DayBody({
  date,
  today,
  onDay,
  view,
  onViewChange,
  onOpenTask,
  onEditHabit,
  onNew,
}: {
  date: LocalDate;
  today: LocalDate;
  onDay: string;
  view: ViewOptions;
  onViewChange: (patch: Partial<ViewOptions>) => void;
  onOpenTask: (task: Task) => void;
  onEditHabit: (habit: Habit) => void;
  onNew: () => void;
}) {
  const habits = useDayHabits(date);
  const tagList = useTags();
  const dayResult = useAtomValue(tasksForDayAtom(date));
  const unscheduledResult = useAtomValue(unscheduledAtom(date));
  const { reload } = useTaskActions();
  const tags = useTagMap();

  const day = AsyncResult.isSuccess(dayResult) ? dayResult.value : undefined;
  const unscheduled = AsyncResult.isSuccess(unscheduledResult) ? unscheduledResult.value : undefined;

  const all = useMemo(
    () => [
      ...(day?.open ?? []).map(({ task }) => task),
      ...(day?.settled ?? []).map(({ task }) => task),
      ...(unscheduled?.open ?? []),
      ...(unscheduled?.settled ?? []),
    ],
    [day, unscheduled],
  );
  const { statusOf, change, overridden } = useOptimisticStatus(all);
  const kept = new Set(useWithoutRemoved(all).map((task) => task.id));
  const shown = (task: Task) => kept.has(task.id);

  // Lists with the user's latest clicks applied: a just-settled task moves
  // to the top of Settled, a reopened one back to its open list.
  const dayTasks = [...(day?.open ?? []), ...(day?.settled ?? [])].map(({ task }) => task).filter(shown);
  const open = sortTasks(
    dayTasks.filter((task) => statusOf(task) !== "settled"),
    view.sort,
    view.direction,
  );
  const unscheduledOpen = sortTasks(
    [...(unscheduled?.open ?? []), ...(unscheduled?.settled ?? [])].filter(
      (task) => shown(task) && statusOf(task) !== "settled",
    ),
    view.sort,
    view.direction,
  );
  const settled = all.filter((task) => shown(task) && statusOf(task) === "settled");
  const justSettled = settled.filter((task) => overridden.get(task.id) === "settled");
  const settledList = [...justSettled, ...settled.filter((task) => !justSettled.includes(task))];

  const failed = AsyncResult.isFailure(dayResult) || AsyncResult.isFailure(unscheduledResult);
  const rowProps = { tags, today, onStatusChange: change, onOpen: onOpenTask, statusOf };

  // In All, habits show only while some are due: once they're all checked,
  // the habits tab below says so.
  const habitsInline = view.show === "all" && habits.due.length > 0;
  const tasksBody = failed ? (
      <EmptyState>
        Couldn't load your tasks.
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </EmptyState>
    ) : !day ? (
      <TaskRowsSkeleton />
    ) : open.length > 0 ? (
      view.group === "tag" ? (
        groupByTag(open, tagList ?? []).map(({ tag, tasks }) => (
          <section key={tag?.id ?? "other"} aria-label={tag?.name ?? "Other"} className="flex flex-col gap-0.5 pt-2 first:pt-0">
            <h3 className="px-2">
              {tag ? <TagChip name={tag.name} color={tag.color} /> : <span className="text-xs text-muted-foreground">Other</span>}
            </h3>
            <TaskList tasks={tasks} label={tag?.name ?? "Other"} {...rowProps} />
          </section>
        ))
      ) : (
        <TaskList tasks={open} label={`Tasks ${onDay}`} {...rowProps} />
      )
    ) : settled.length > 0 && dayTasks.length > 0 ? (
      <EmptyState className={cn("text-success", habitsInline && "flex-none")}>Everything {onDay} is settled.</EmptyState>
    ) : (
      <EmptyState className={cn(habitsInline && "flex-none")}>No tasks {onDay}. Add one with New task, or press N.</EmptyState>
    );

  const newLabel = view.show === "habits" ? "New habit" : "New task";
  // Settled holds the day's checked-off habits too (goals join in step 8).
  const settledCount = day && unscheduled && habits.loaded ? settledList.length + habits.settled.length : null;

  return (
    <LayoutGroup>
      <ViewControls
        view={view}
        onChange={onViewChange}
        kinds
        groups={[
          { value: "auto", label: "None" },
          { value: "tag", label: "Tag" },
        ]}
        className="-mt-1"
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <section aria-label="Tasks" className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-0.5 pb-14">
          {view.show === "habits" ? (
            <HabitsView habits={habits} date={date} today={today} onDay={onDay} onEdit={onEditHabit} />
          ) : view.show === "goals" ? (
            <EmptyState>Your goals will show here once you can add them.</EmptyState>
          ) : (
            <>
              {tasksBody}
              {habitsInline && (
                <section aria-label="Habits" className="flex flex-col gap-2 pt-4">
                  <h3 className="px-2 text-xs font-medium text-muted-foreground">Habits</h3>
                  <DueHabits habits={habits} date={date} today={today} onEdit={onEditHabit} allChecked={false} />
                </section>
              )}
            </>
          )}
        </section>
        <Button
          className="absolute right-0 bottom-1 rounded-full shadow-(--card-shadow) max-sm:size-10"
          onClick={onNew}
          aria-keyshortcuts="N"
          aria-label={newLabel}
          title={`${newLabel} (N)`}
        >
          <PlusIcon />
          <span className="max-sm:hidden">{newLabel}</span>
        </Button>
      </div>

      <DayTabs
        label="settled, sessions and unscheduled"
        tabs={[
          {
            value: "settled",
            label: <Counted label="Settled" count={settledCount} />,
            content:
              settledList.length > 0 || habits.settled.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {settledList.length > 0 && <TaskList tasks={settledList} label="Settled" {...rowProps} />}
                  <SettledHabits habits={habits} date={date} today={today} emptyText="" />
                </div>
              ) : (
                `Tasks and habits you settle ${onDay} move here.`
              ),
          },
          {
            value: "sessions",
            label: <Counted label="Sessions" count={0} />,
            content: `Focus sessions from ${onDay} show here.`,
          },
          {
            value: "unscheduled",
            label: <Counted label="Unscheduled" count={unscheduled ? unscheduledOpen.length : null} />,
            content:
              unscheduledOpen.length > 0 ? (
                <TaskList tasks={unscheduledOpen} label="Unscheduled" {...rowProps} />
              ) : (
                "Tasks without a date wait here. Clear a task's assigned date to put it here."
              ),
          },
        ]}
      />

      <DayTabs
        label="habits and goals"
        tabs={[
          {
            value: "habits",
            label: <HabitsTabLabel habits={habits} />,
            done: habits.allChecked,
            content: (
              <SettledHabits
                habits={habits}
                date={date}
                today={today}
                emptyText={
                  habits.loaded && habits.due.length === 0
                    ? `No habits are due ${onDay}.`
                    : `Habits you check off ${onDay} move here.`
                }
              />
            ),
          },
          {
            value: "goals",
            label: (
              <>
                <TargetIcon />
                No active goals
              </>
            ),
            content: "Your active goals show here every day, with how far along they are.",
          },
        ]}
      />

    </LayoutGroup>
  );
}

/**
 * The Habits view: the due cards, or "All habits checked".
 */
function HabitsView({
  habits,
  date,
  today,
  onDay,
  onEdit,
}: {
  habits: DayHabits;
  date: LocalDate;
  today: LocalDate;
  onDay: string;
  onEdit: (habit: Habit) => void;
}) {
  const { reload } = useHabitActions();
  if (habits.failed) {
    return (
      <EmptyState>
        Couldn't load your habits.
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </EmptyState>
    );
  }
  if (!habits.loaded) return <TaskRowsSkeleton />;
  if (habits.due.length === 0 && habits.settled.length === 0) {
    return <EmptyState>No habits due {onDay}. Add one with New habit, or press N.</EmptyState>;
  }
  // Checked-off habits are in the Settled tab below.
  return (
    <div className="px-2">
      <DueHabits habits={habits} date={date} today={today} onEdit={onEdit} />
    </div>
  );
}

/** The habits tab's title is the day's habit status. */
function HabitsTabLabel({ habits }: { habits: DayHabits }) {
  if (habits.allChecked) {
    return (
      <>
        <CheckCheckIcon />
        All habits checked
      </>
    );
  }
  if (habits.loaded && habits.due.length > 0) {
    return (
      <>
        <RepeatIcon />
        <Counted label="Habits due" count={habits.due.length} />
      </>
    );
  }
  return (
    <>
      <RepeatIcon />
      {habits.loaded ? "No habits due" : "Habits"}
    </>
  );
}

function DayBodySkeleton() {
  return (
    <div className="flex-1">
      <TaskRowsSkeleton />
    </div>
  );
}

function TaskRowsSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2 py-2" aria-hidden="true">
      {[70, 45, 60].map((width) => (
        <div key={width} className="flex items-center gap-3">
          <Skeleton className="size-4.5 rounded-full" />
          <Skeleton className="h-4" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-2 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Both panes stay mounted: on phones the inactive one is hidden; from `md`
// up both show. Each card fills its pane's full height.
const paneClass =
  "relative flex min-h-0 flex-col data-[state=inactive]:hidden md:data-[state=inactive]:flex";
const cardClass =
  "min-h-0 flex-1 rounded-2xl [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]";

/**
 * A soft gradient shadow under a card (`--card-glow`), in both themes. It
 * stacks in the panes' shared layer (`isolate` on the tabs), under both
 * cards, so one card's glow never paints over the other card.
 */
function CardGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-1.5 top-6 -bottom-3 -z-10 rounded-3xl bg-(image:--card-glow) blur-xl"
    />
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * A tab label with its count. Once loaded (`count` isn't `null`), a change
 * pops the badge, so a settled task is seen landing in Settled.
 */
function Counted({ label, count }: { label: string; count: number | null }) {
  // The first loaded count doesn't pop; every change after it does.
  const first = useRef<number | null>(null);
  const changed = useRef(false);
  if (first.current === null) first.current = count;
  else if (count !== first.current) changed.current = true;
  const bump = changed.current;
  return (
    <>
      {label}
      <motion.span
        key={count ?? "loading"}
        initial={bump ? { scale: 1.4 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 18 }}
        className="inline-flex"
      >
        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums sm:h-4.5 sm:min-w-4.5 sm:text-xs">
          {count ?? 0}
        </Badge>
      </motion.span>
    </>
  );
}

type DayTab = {
  readonly value: string;
  /** The tab's title. For habits and goals it's the status itself. */
  readonly label: ReactNode;
  readonly content: ReactNode;
  /** A done status ("All habits checked") reads in green. */
  readonly done?: boolean;
};

/**
 * A row of tabs in the day card, with its own fold chevron beside it. The
 * tabs only switch what shows; the chevron alone folds and unfolds. Both
 * rows start folded.
 */
function DayTabs({
  label,
  tabs,
  defaultOpen = false,
}: {
  label: string;
  tabs: readonly DayTab[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState(tabs[0]?.value ?? "");
  const contentId = useId();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Tabs value={tab} onValueChange={setTab} className="gap-2" aria-label={label}>
        <div className="flex items-center gap-1">
          <TabsList className="min-w-0">
            {tabs.map(({ value, label: title, done }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  // The text keeps its color on hover and when picked; in dark
                  // mode a dim outline marks the picked tab instead.
                  "gap-1 px-1.5 text-[0.8125rem] hover:text-foreground/60 data-active:hover:text-foreground sm:gap-1.5 sm:px-3 sm:text-sm dark:hover:text-muted-foreground dark:data-active:border-white/25 dark:data-active:text-muted-foreground",
                  done &&
                    "text-success hover:text-success data-active:text-success-ink data-active:hover:text-success-ink dark:text-success dark:hover:text-success dark:data-active:text-success",
                )}
              >
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-controls={contentId}
              aria-label={open ? `Hide ${label}` : `Show ${label}`}
            >
              <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent id={contentId}>
          {tabs.map(({ value, content }) => (
            <TabsContent key={value} value={value} className="max-h-[min(14rem,30dvh)] overflow-y-auto">
              {typeof content === "string" ? <Placeholder>{content}</Placeholder> : content}
            </TabsContent>
          ))}
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

const LIVE_COLLAPSED_KEY = "dueboard-live-collapsed";

/**
 * Whether Live is collapsed on wide screens, remembered per viewer in
 * localStorage. Read after mount, so the server render and hydration agree.
 */
function useLiveCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LIVE_COLLAPSED_KEY) === "true");
    } catch {
      // Storage blocked (private mode, site data off): start expanded.
    }
  }, []);
  const update = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(LIVE_COLLAPSED_KEY, String(next));
    } catch {
      // Not remembered this time; the toggle still works.
    }
  };
  return [collapsed, update] as const;
}
