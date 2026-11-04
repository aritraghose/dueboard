import type { Goal, Habit, Task } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  CalendarRangeIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  ListTodoIcon,
  PlusIcon,
  RepeatIcon,
  StickyNoteIcon,
  TargetIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { DayStepper, NowClock } from "@/components/day-navigator";
import { SessionIndicator, SessionList, SessionWidget } from "@/components/focus-session";
import { GoalDialog } from "@/components/goal-dialog";
import { CompletedGoals, DayGoalCards } from "@/components/goal-progress";
import { HabitDialog } from "@/components/habit-dialog";
import { DueHabits, SettledHabits } from "@/components/habit-section";
import { LiveCard } from "@/components/live-card";
import { TaskDialog } from "@/components/task-card";
import { TagChip } from "@/components/tag-chip";
import { TagFilter } from "@/components/tag-filter";
import { TaskList } from "@/components/task-list";
import { UpcomingSheet } from "@/components/upcoming-sheet";
import { ViewControls } from "@/components/view-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import {
  dayAtom,
  dayUnscheduledAtom,
  notesCountAtom,
  sessionsForDayAtom,
  tasksForDayAtom,
  usePrefetchNeighborDays,
} from "@/hooks/use-day";
import { useGoalDialog } from "@/hooks/use-goal-dialog";
import { type DayGoals, useDayGoals, useGoalActions } from "@/hooks/use-goals";
import { useHabitDialog } from "@/hooks/use-habit-dialog";
import { type DayHabits, useDayHabits, useHabitActions } from "@/hooks/use-habits";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useOpenSessionsTab, useSessionActions, useSessionsTabRequest, useTimerSession } from "@/hooks/use-sessions";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { useOptimisticStatus, useTagMap, useTags, useTaskActions, useWithoutRemoved } from "@/hooks/use-tasks";
import { setTopBarHidden, useTopBarHidden } from "@/hooks/use-top-bar-hidden";
import { type ViewOptions, useViewOptions } from "@/hooks/use-view-options";
import { type LocalDate, formatDay, isLocalDate } from "@/lib/dates";
import { noteCount } from "@/lib/notes";
import { formatMinutes, groupByTag, sortTasks } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type NowSearch = {
  /** The selected day. Absent means today in the user's time zone. */
  date?: LocalDate | undefined;
};

/**
 * Where users land after signing in: one day at a time. The day lives in
 * `?date=YYYY-MM-DD`; anything else in that param is dropped. Two cards: the
 * day (tasks, habits and goals, then at its bottom the Settled / Sessions /
 * Unscheduled tab row with a fold chevron) takes two thirds, Live (with a
 * note box) one third, and the day card takes it all when Live is collapsed.
 * Live (14) is a placeholder until its build step. The whole day comes from
 * one `GetDay` request; the days before and after are kept loaded, so ← and
 * → show them at once. Upcoming (the button in the day card's top-right
 * corner, or U) opens a sheet over the page.
 */
export const Route = createFileRoute("/_app/now")({
  // `date` is always set, even to `undefined`: the router merges this over
  // the raw search, so leaving the key out would let an invalid date through.
  validateSearch: (search: Record<string, unknown>): NowSearch => ({
    date: typeof search.date === "string" && isLocalDate(search.date) ? search.date : undefined,
  }),
  head: () => ({ meta: [{ title: "Now · Dueboard" }] }),
  staticData: { topBar: { start: StartSessionButton, center: TopBarClock, hideable: true, session: false } },
  component: Now,
});

/**
 * In the top row: start a focus session, on a cream pill. It opens today's
 * Sessions tab, where the start form is. While a session is running or
 * paused, its timer takes this button's place.
 */
function StartSessionButton() {
  const { session } = useTimerSession();
  const openTab = useOpenSessionsTab();
  const navigate = Route.useNavigate();
  if (session) return <SessionIndicator />;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full bg-cream text-cream-foreground ring-1 ring-cream-foreground/10 hover:bg-cream/80! hover:text-cream-foreground! dark:ring-0"
      onClick={() => {
        openTab();
        void navigate({ search: { date: undefined }, replace: true });
      }}
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
  const goalDialog = useGoalDialog();
  const [view, setView] = useViewOptions("now");
  // N adds what the list shows: a habit or goal in those views, a task otherwise.
  const newItem = () => {
    if (view.show === "habits") habitDialog.openNew();
    else if (view.show === "goals") goalDialog.openNew();
    else if (date) dialog.openNew(date);
  };
  useKeyShortcut("n", newItem);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  useKeyShortcut("u", () => setUpcomingOpen(true));
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
                {topBarHidden ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </Button>
              <DayStepper date={date} today={today} onChange={changeDate} />
              <div className="mt-1 flex items-center gap-1 justify-self-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground max-sm:size-8 max-sm:px-0"
                  aria-keyshortcuts="U"
                  aria-label="Upcoming"
                  title="Upcoming (U)"
                  onClick={() => setUpcomingOpen(true)}
                >
                  <CalendarRangeIcon />
                  <span className="max-sm:hidden">Upcoming</span>
                </Button>
                {liveCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:hidden"
                    aria-label="Show Live"
                    onClick={() => setLiveCollapsed(false)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                )}
              </div>
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
                  onEditGoal={goalDialog.openGoal}
                  onNew={newItem}
                />
              ) : (
                <DayBodySkeleton />
              )}
            </CardContent>
          </Card>
          {date && <PrefetchNeighbors date={date} />}
          {today && (
            <UpcomingSheet
              open={upcomingOpen}
              onOpenChange={setUpcomingOpen}
              today={today}
              onOpenDay={changeDate}
              onOpenTask={dialog.openTask}
              onEditHabit={habitDialog.openHabit}
              onEditGoal={goalDialog.openGoal}
            />
          )}
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
            <GoalDialog
              target={goalDialog.target}
              open={goalDialog.open}
              version={goalDialog.version}
              onOpenChange={goalDialog.setOpen}
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
 * The day card's body: the view row (show, tags, sort, group), the day's
 * open tasks, due habits and active goals (as the Show choice says) with
 * New task, habit or goal floating at their bottom right, then the
 * Settled / Sessions / Unscheduled tab row. Unscheduled shows on every day,
 * not only today (planning.md, step 4 decision).
 */
function DayBody({
  date,
  today,
  onDay,
  view,
  onViewChange,
  onOpenTask,
  onEditHabit,
  onEditGoal,
  onNew,
}: {
  date: LocalDate;
  today: LocalDate;
  onDay: string;
  view: ViewOptions;
  onViewChange: (patch: Partial<ViewOptions>) => void;
  onOpenTask: (task: Task) => void;
  onEditHabit: (habit: Habit) => void;
  onEditGoal: (goal: Goal) => void;
  onNew: () => void;
}) {
  const habits = useDayHabits(date);
  const goals = useDayGoals(date);
  const tagList = useTags();
  const dayResult = useAtomValue(tasksForDayAtom(date));
  const unscheduledResult = useAtomValue(dayUnscheduledAtom(date));
  const notesResult = useAtomValue(notesCountAtom(date));
  const { reload } = useTaskActions();
  const tags = useTagMap();
  const sessionsResult = useAtomValue(sessionsForDayAtom(date));
  const daySessions = AsyncResult.isSuccess(sessionsResult) ? sessionsResult.value.sessions : undefined;
  const tense = date < today ? "past" : date > today ? "future" : "today";
  const { session: activeSession } = useTimerSession();
  const { reload: reloadSessions } = useSessionActions();
  const [tabRequested, tabRequestHandled] = useSessionsTabRequest();

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
  // The tag filter: tasks with any picked tag. Habits and goals wear their
  // system tags, so they show only when those are picked.
  const tagFilter = view.tags.filter((id) => tags.has(id));
  const filtering = tagFilter.length > 0;
  const systemTagPicked = (kind: "habit" | "goal") =>
    !filtering || tagFilter.some((id) => tags.get(id)?.systemKind === kind);
  const showHabits = systemTagPicked("habit");
  const showGoals = systemTagPicked("goal");
  const shown = (task: Task) => kept.has(task.id) && (!filtering || tagFilter.includes(task.tagId));
  const dueHabits = showHabits ? habits.due.length : 0;
  const settledHabits = showHabits ? habits.settled.length : 0;
  const activeGoals = showGoals ? goals.active.length + goals.celebrating.size : 0;
  const completedGoals = showGoals ? goals.completed.length : 0;

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

  // In All, habits show only while some are due (checked ones are in Settled).
  const habitsInline = view.show === "all" && dueHabits > 0;
  // Active goals show every day until completed (a just-completed one stays for its celebration).
  const goalsInline = view.show === "all" && activeGoals > 0;
  const inlineBelow = habitsInline || goalsInline;
  // Settled holds the day's checked-off habits and completed goals too.
  const settledCount =
    day && unscheduled && habits.loaded && goals.loaded
      ? settledList.length + settledHabits + completedGoals
      : null;
  // Nothing left: no open tasks, due habits or active goals, no session
  // running or paused today, and something was settled.
  const sessionGoing = date === today && Boolean(activeSession);
  const everythingSettled =
    settledCount !== null &&
    open.length === 0 &&
    dueHabits === 0 &&
    activeGoals === 0 &&
    !sessionGoing &&
    settledCount > 0;
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
    ) : view.show === "all" && settledCount === null ? (
      // Which message fits depends on habits and goals too; wait for them.
      <TaskRowsSkeleton />
    ) : view.show === "all" && everythingSettled ? (
      <SettledState>Everything {onDay} is settled.</SettledState>
    ) : dayTasks.length > 0 ? (
      <SettledState className={cn(inlineBelow && "flex-none")}>All tasks {onDay} settled.</SettledState>
    ) : (
      <EmptyState className={cn(inlineBelow && "flex-none")}>
        {filtering
          ? `No tasks with these tags ${onDay}.`
          : tense === "past"
            ? `No tasks were planned ${onDay}.`
            : tense === "future"
              ? `Nothing planned ${onDay} yet. Add a task with New task, or press N.`
              : `No tasks ${onDay}. Add one with New task, or press N.`}
      </EmptyState>
    );

  const newLabel = view.show === "habits" ? "New habit" : view.show === "goals" ? "New goal" : "New task";

  // Past days sum up what happened; future days what's planned.
  const notesCount = AsyncResult.isSuccess(notesResult) ? notesResult.value : null;
  const focused = AsyncResult.isSuccess(sessionsResult) ? sessionsResult.value.focusedMinutes : null;
  const summary: SummaryItem[] | null =
    tense === "today" || settledCount === null || notesCount === null || focused === null
      ? null
      : tense === "past"
        ? [
            { icon: CircleCheckIcon, count: settledList.length, text: (n) => `${plural(n, "task")} settled` },
            { icon: RepeatIcon, count: settledHabits, text: (n) => `${plural(n, "habit")} checked` },
            { icon: TargetIcon, count: completedGoals, text: (n) => `${plural(n, "goal")} completed` },
            { icon: TimerIcon, count: focused, text: (n) => `${formatMinutes(n)} focused` },
            { icon: StickyNoteIcon, count: notesCount, text: noteCount, to: "/notes" },
          ]
        : [
            { icon: ListTodoIcon, count: open.length, text: (n) => `${plural(n, "task")} planned` },
            { icon: RepeatIcon, count: dueHabits, text: (n) => `${plural(n, "habit")} due` },
            {
              icon: TargetIcon,
              count: showGoals ? goals.active.filter((goal) => goal.targetDate === date).length : 0,
              text: (n) => `${plural(n, "goal")} due`,
            },
          ];

  return (
    <LayoutGroup>
      {tense !== "today" && (
        <DaySummary items={summary} empty={tense === "past" ? "Nothing was recorded this day." : "Nothing planned yet."} />
      )}
      <ViewControls
        view={view}
        onChange={onViewChange}
        kinds
        filter={
          <TagFilter tags={tagList} value={tagFilter} onChange={(next) => onViewChange({ tags: next })} />
        }
        groups={[
          { value: "auto", label: "None" },
          { value: "tag", label: "Tag" },
        ]}
        className="-mt-1"
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <section aria-label="Tasks" className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-0.5 pb-14">
          {view.show === "habits" ? (
            showHabits ? (
              <HabitsView habits={habits} date={date} today={today} onDay={onDay} tense={tense} onEdit={onEditHabit} />
            ) : (
              <EmptyState>Pick the habit tag in the filter to see habits.</EmptyState>
            )
          ) : view.show === "goals" ? (
            showGoals ? (
              <GoalsView goals={goals} today={today} onDay={onDay} onEdit={onEditGoal} />
            ) : (
              <EmptyState>Goals wear the goal tag. Pick it in the tag filter to see them here.</EmptyState>
            )
          ) : (
            <>
              {tasksBody}
              {habitsInline && (
                <section aria-label="Habits" className="flex flex-col gap-2 pt-4">
                  <h3 className="px-2 text-xs font-medium text-muted-foreground">Habits</h3>
                  <DueHabits habits={habits} date={date} today={today} onEdit={onEditHabit} allChecked={false} />
                </section>
              )}
              {goalsInline && (
                <section aria-label="Goals" className="flex flex-col gap-2 px-2 pt-4">
                  <h3 className="text-xs font-medium text-muted-foreground">Goals</h3>
                  <DayGoalCards goals={goals} today={today} onEdit={onEditGoal} />
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
        // Past days open on what got done; crossing into the past remounts it unfolded.
        key={tense === "past" ? "past" : "current"}
        defaultOpen={tense === "past"}
        label="settled, sessions and unscheduled"
        request={tabRequested && date === today ? "sessions" : null}
        onRequestHandled={tabRequestHandled}
        tabs={[
          {
            value: "settled",
            label: <Counted label="Settled" count={settledCount} />,
            content:
              settledCount === null && !failed ? (
                <TaskRowsSkeleton />
              ) : settledList.length > 0 || settledHabits > 0 || completedGoals > 0 ? (
                <div className="flex flex-col gap-1">
                  {settledList.length > 0 && <TaskList tasks={settledList} label="Settled" {...rowProps} />}
                  {showHabits && <SettledHabits habits={habits} date={date} today={today} emptyText="" />}
                  {showGoals && <CompletedGoals goals={goals} today={today} onEdit={onEditGoal} emptyText="" />}
                </div>
              ) : tense === "past" ? (
                `Nothing was settled ${onDay}.`
              ) : (
                `Tasks, habits and goals you finish ${onDay} move here.`
              ),
          },
          {
            value: "sessions",
            label: <Counted label="Sessions" count={daySessions ? daySessions.length : null} />,
            contentClassName: date === today ? "max-h-[min(26rem,52dvh)]!" : undefined,
            content:
              date === today ? (
                <SessionWidget sessions={daySessions} />
              ) : AsyncResult.isFailure(sessionsResult) ? (
                <EmptyState className="py-4">
                  Couldn't load the sessions.
                  <Button variant="outline" size="sm" onClick={() => void reloadSessions()}>
                    Try again
                  </Button>
                </EmptyState>
              ) : !daySessions ? (
                <TaskRowsSkeleton />
              ) : daySessions.length > 0 ? (
                <SessionList sessions={daySessions} label={`Sessions ${onDay}`} />
              ) : date < today ? (
                `No focus sessions ${onDay}.`
              ) : (
                "Focus sessions start on the day itself. Come back then."
              ),
          },
          {
            value: "unscheduled",
            label: <Counted label="Unscheduled" count={unscheduled ? unscheduledOpen.length : null} />,
            content:
              !unscheduled && !failed ? (
                <TaskRowsSkeleton />
              ) : unscheduledOpen.length > 0 ? (
                <TaskList tasks={unscheduledOpen} label="Unscheduled" {...rowProps} />
              ) : (
                "Tasks without a date wait here."
              ),
          },
        ]}
      />

    </LayoutGroup>
  );
}

/**
 * The Habits view: the due cards, or "All habits today checked".
 */
function HabitsView({
  habits,
  date,
  today,
  onDay,
  tense,
  onEdit,
}: {
  habits: DayHabits;
  date: LocalDate;
  today: LocalDate;
  onDay: string;
  tense: Tense;
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
    return (
      <EmptyState>
        {tense === "past" ? `No habits were due ${onDay}.` : `No habits due ${onDay}. Add one with New habit, or press N.`}
      </EmptyState>
    );
  }
  // Checked-off habits are in the Settled tab below.
  return (
    <div className="px-2">
      <DueHabits habits={habits} date={date} today={today} onEdit={onEdit} />
    </div>
  );
}

/** The Goals view: the active goal cards. Completed ones are in the tabs below. */
function GoalsView({
  goals,
  today,
  onDay,
  onEdit,
}: {
  goals: DayGoals;
  today: LocalDate;
  onDay: string;
  onEdit: (goal: Goal) => void;
}) {
  const { reload } = useGoalActions();
  if (goals.failed) {
    return (
      <EmptyState>
        Couldn't load your goals.
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </EmptyState>
    );
  }
  if (!goals.loaded) return <TaskRowsSkeleton />;
  if (goals.active.length === 0 && goals.celebrating.size === 0) {
    return goals.completed.length > 0 ? (
      <SettledState>All goals {onDay} completed.</SettledState>
    ) : (
      <EmptyState>No active goals. Add one with New goal, or press N.</EmptyState>
    );
  }
  return (
    <div className="px-2">
      <DayGoalCards goals={goals} today={today} onEdit={onEdit} />
    </div>
  );
}

type Tense = "past" | "today" | "future";

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

type SummaryItem = {
  readonly icon: LucideIcon;
  readonly count: number;
  readonly text: (count: number) => string;
  /** Where the item links, if anywhere. */
  readonly to?: "/notes";
};

/**
 * One quiet line under the day's heading on past and future days: what got
 * done (tasks settled, habits checked, minutes focused, notes) or what's
 * planned. Only the counts above zero show; `null` while the day loads.
 */
function DaySummary({ items, empty }: { items: readonly SummaryItem[] | null; empty: string }) {
  if (!items) {
    return (
      <div className="-mt-2 flex justify-center pb-1" aria-hidden="true">
        <Skeleton className="h-3.5 w-48" />
      </div>
    );
  }
  const shown = items.filter((item) => item.count > 0);
  return (
    <ul
      aria-label="Day summary"
      className="-mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1 text-xs text-muted-foreground"
    >
      {shown.length === 0 ? (
        <li>{empty}</li>
      ) : (
        shown.map(({ icon: Icon, count, text, to }) => {
          const content = (
            <>
              <Icon aria-hidden="true" className="size-3.5" />
              <span className="tabular-nums">{text(count)}</span>
            </>
          );
          return (
            <li key={text(count)}>
              {to ? (
                <Link
                  to={to}
                  className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {content}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5">{content}</span>
              )}
            </li>
          );
        })
      )}
    </ul>
  );
}

/** Keeps the days before and after `date` loaded once `date` itself has, so ← and → are instant. */
function PrefetchNeighbors({ date }: { date: LocalDate }) {
  const loaded = !AsyncResult.isInitial(useAtomValue(dayAtom(date)));
  return loaded ? <Neighbors date={date} /> : null;
}

function Neighbors({ date }: { date: LocalDate }) {
  usePrefetchNeighborDays(date);
  return null;
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

/** A day (or part of it) with nothing left: a check and the line in `--success`. */
function SettledState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "mx-2 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-success/25 bg-success/5 px-4 py-8 text-center text-sm font-medium text-success",
        className,
      )}
    >
      <span className="grid size-9 place-items-center rounded-full bg-success text-background">
        <CheckIcon aria-hidden="true" className="size-5" strokeWidth={3} />
      </span>
      {children}
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
  /** The tab's title, with its count. */
  readonly label: ReactNode;
  readonly content: ReactNode;
  /** Replaces the content's default height cap. */
  readonly contentClassName?: string | undefined;
};

/**
 * A row of tabs in the day card, with its own fold chevron beside it. The
 * tabs only switch what shows; the chevron alone folds and unfolds. It
 * starts folded. `request` names a tab to open and unfold (the top row's
 * "Start a session"); `onRequestHandled` is called once it's shown.
 */
function DayTabs({
  label,
  tabs,
  defaultOpen = false,
  request = null,
  onRequestHandled,
}: {
  label: string;
  tabs: readonly DayTab[];
  defaultOpen?: boolean;
  request?: string | null;
  onRequestHandled?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState(tabs[0]?.value ?? "");
  const contentId = useId();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!request) return;
    setTab(request);
    setOpen(true);
    onRequestHandled?.();
    requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: "nearest" }));
  }, [request, onRequestHandled]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Tabs value={tab} onValueChange={setTab} className="gap-2" aria-label={label}>
        <div ref={rowRef} className="flex items-center gap-1">
          <TabsList className="min-w-0">
            {tabs.map(({ value, label: title }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  // The text keeps its color on hover and when picked; in dark
                  // mode a dim outline marks the picked tab instead.
                  "gap-1 px-1.5 text-[0.8125rem] hover:text-foreground/60 data-active:hover:text-foreground sm:gap-1.5 sm:px-3 sm:text-sm dark:hover:text-muted-foreground dark:data-active:border-white/25 dark:data-active:text-muted-foreground",
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
          {tabs.map(({ value, content, contentClassName }) => (
            <TabsContent
              key={value}
              value={value}
              // On phones the last row can scroll clear of Tibo's floating button.
              className={cn("max-h-[min(14rem,30dvh)] overflow-y-auto max-md:pb-12", contentClassName)}
            >
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
