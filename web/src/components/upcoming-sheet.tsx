import type { Goal, Habit, Task, UpcomingDay, UpcomingHabit } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { ArrowUpRightIcon, RepeatIcon, TargetIcon } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TaskList } from "@/components/task-list";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useGoalColor } from "@/hooks/use-goals";
import { useHabitColor } from "@/hooks/use-habits";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOptimisticStatus, useTagMap, useTaskActions, useWithoutRemoved } from "@/hooks/use-tasks";
import { UPCOMING_PAGE_DAYS, upcomingAtom } from "@/hooks/use-upcoming";
import { type LocalDate, addDays, daysBetween, formatDay, formatDayLong } from "@/lib/dates";
import { roundPercent } from "@/lib/goals";
import { upcomingHint } from "@/lib/habits";
import { cn } from "@/lib/utils";

const MAX_DAYS_AHEAD = 365;

export function UpcomingSheet({
  open,
  onOpenChange,
  today,
  onOpenDay,
  onOpenTask,
  onEditHabit,
  onEditGoal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: LocalDate;
  onOpenDay: (date: LocalDate) => void;
  onOpenTask: (task: Task) => void;
  onEditHabit: (habit: Habit) => void;
  onEditGoal: (goal: Goal) => void;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        className={cn(
          "gap-0 p-0",
          mobile ? "h-[88dvh]! rounded-t-2xl" : "w-full sm:max-w-md!",
        )}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <SheetTitle className="text-base">Upcoming</SheetTitle>
          <SheetDescription>Tasks, habits and goals for the coming days.</SheetDescription>
        </SheetHeader>
        {open && (
          <UpcomingList
            today={today}
            onOpenDay={(date) => {
              onOpenChange(false);
              onOpenDay(date);
            }}
            onOpenTask={onOpenTask}
            onEditHabit={onEditHabit}
            onEditGoal={onEditGoal}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function UpcomingList({
  today,
  onOpenDay,
  onOpenTask,
  onEditHabit,
  onEditGoal,
}: {
  today: LocalDate;
  onOpenDay: (date: LocalDate) => void;
  onOpenTask: (task: Task) => void;
  onEditHabit: (habit: Habit) => void;
  onEditGoal: (goal: Goal) => void;
}) {
  const from = addDays(today, 1);
  const [pages, setPages] = useState(1);
  const result = useAtomValue(upcomingAtom({ from, pages }));
  const last = useRef<{ from: LocalDate; days: readonly UpcomingDay[]; until: LocalDate } | null>(null);
  if (AsyncResult.isSuccess(result)) last.current = { from, ...result.value };
  const shown = last.current?.from === from ? last.current : null;
  useEffect(() => setPages(1), [today]);

  const tags = useTagMap();
  const { reload } = useTaskActions();
  const tasks = useMemo(() => (shown?.days ?? []).flatMap((day) => day.tasks.map(({ task }) => task)), [shown]);
  const { statusOf, change } = useOptimisticStatus(tasks);
  const kept = new Set(useWithoutRemoved(tasks).map((task) => task.id));
  const habitColor = useHabitColor();
  const goalColor = useGoalColor();

  if (AsyncResult.isFailure(result) && !shown) {
    return (
      <div className="m-5 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Couldn't load what's coming up.
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!shown) return <UpcomingSkeleton />;

  const loading = !AsyncResult.isSuccess(result);
  const canLoadMore = daysBetween(today, shown.until) <= MAX_DAYS_AHEAD;
  const through = formatDay(addDays(shown.until, -1), today);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
      <LayoutGroup id="upcoming">
        {shown.days.length === 0 ? (
          <p className="mx-5 mt-5 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-balance text-muted-foreground">
            Nothing planned through {through}. Tasks with dates, habits, and goals with a target date show here.
          </p>
        ) : (
          <ol className="flex flex-col">
            {shown.days.map((day, index) => {
              const previous = index === 0 ? today : shown.days[index - 1]!.date;
              const free = daysBetween(previous, day.date) - 1;
              const dayTasks = day.tasks.map(({ task }) => task).filter((task) => kept.has(task.id) && statusOf(task) !== "settled");
              return (
                <li key={day.date} className="flex flex-col">
                  {free > 0 && <FreeDays count={free} />}
                  <DayHeader date={day.date} today={today} onOpen={() => onOpenDay(day.date)} />
                  <div className="flex flex-col px-3 pb-3">
                    {dayTasks.length > 0 && (
                      <LayoutGroup id={day.date}>
                        <TaskList
                          tasks={dayTasks}
                          label={`Tasks on ${formatDay(day.date, today)}`}
                          tags={tags}
                          today={today}
                          statusOf={statusOf}
                          onStatusChange={change}
                          onOpen={onOpenTask}
                        />
                      </LayoutGroup>
                    )}
                    {day.habits.map((entry) => (
                      <HabitRow key={entry.habit.id} entry={entry} today={today} color={habitColor} onOpen={onEditHabit} />
                    ))}
                    {day.goals.map((goal) => (
                      <GoalRow key={goal.id} goal={goal} color={goalColor} onOpen={onEditGoal} />
                    ))}
                    {dayTasks.length === 0 && day.habits.length === 0 && day.goals.length === 0 && (
                      <p className="px-2 py-2 text-sm text-muted-foreground">Everything here is settled.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </LayoutGroup>

      <div className="mt-auto flex flex-col items-center gap-2 px-5 pt-4">
        {AsyncResult.isFailure(result) && (
          <p role="alert" className="text-center text-sm text-destructive">
            Couldn't load more days.
          </p>
        )}
        {canLoadMore ? (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => (AsyncResult.isFailure(result) ? void reload() : setPages((count) => count + 1))}
          >
            {loading && <Spinner />}
            {AsyncResult.isFailure(result) ? "Try again" : "Load more days"}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Showing through {through}
          {canLoadMore && <span className="sr-only">. Load more days adds {UPCOMING_PAGE_DAYS} more.</span>}
        </p>
      </div>
    </div>
  );
}

function DayHeader({ date, today, onOpen }: { date: LocalDate; today: LocalDate; onOpen: () => void }) {
  const days = daysBetween(today, date);
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-popover/90 px-5 py-2.5 backdrop-blur-sm supports-backdrop-filter:bg-popover/75">
      <h3 className="flex min-w-0 flex-1 items-baseline gap-2">
        <time dateTime={date} title={formatDayLong(date)} className="truncate text-sm font-semibold">
          {days === 1 ? "Tomorrow" : formatDay(date, today)}
        </time>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {days === 1 ? formatDay(date, today) : `in ${days} days`}
        </span>
      </h3>
      <Button
        variant="ghost"
        size="sm"
        className="-mr-2 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
        onClick={onOpen}
        aria-label={`Open ${formatDayLong(date)} on Now`}
      >
        Open day
        <ArrowUpRightIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function FreeDays({ count }: { count: number }) {
  return (
    <p className="flex items-center gap-3 px-5 py-2 text-xs text-muted-foreground/80">
      <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-border" />
      {count === 1 ? "1 free day" : `${count} free days`}
      <span aria-hidden="true" className="h-px flex-1 border-t border-dashed border-border" />
    </p>
  );
}

function HabitRow({
  entry,
  today,
  color,
  onOpen,
}: {
  entry: UpcomingHabit;
  today: LocalDate;
  color: string;
  onOpen: (habit: Habit) => void;
}) {
  const hint = upcomingHint(entry.habit, entry.progress, today) ?? entry.schedule;
  return (
    <button
      type="button"
      data-tag={color}
      onClick={() => onOpen(entry.habit)}
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RepeatIcon aria-hidden="true" className="size-4.5 shrink-0 text-tag" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 wrap-break-word">{entry.habit.title}</span>
        <span className="text-xs text-tag-ink">{hint}</span>
      </span>
    </button>
  );
}

function GoalRow({ goal, color, onOpen }: { goal: Goal; color: string; onOpen: (goal: Goal) => void }) {
  return (
    <button
      type="button"
      data-tag={color}
      onClick={() => onOpen(goal)}
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TargetIcon aria-hidden="true" className="size-4.5 shrink-0 text-tag" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 wrap-break-word">{goal.name}</span>
        <span className="text-xs text-tag-ink">Target date, {roundPercent(goal)}% done</span>
      </span>
    </button>
  );
}

function UpcomingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-5 py-4" aria-hidden="true">
      {[[65, 40], [55], [70, 50, 35]].map((rows, group) => (
        <div key={group} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28" />
          {rows.map((width) => (
            <div key={width} className="flex items-center gap-3 px-2">
              <Skeleton className="size-4.5 rounded-full" />
              <Skeleton className="h-4" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
