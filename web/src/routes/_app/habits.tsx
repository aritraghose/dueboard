import { HABIT_HISTORY_WEEKS, type HabitStatus, type HabitSummary } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  ArchiveIcon,
  FlameIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HabitDialog } from "@/components/habit-dialog";
import { HabitRing } from "@/components/habit-ring";
import { CreateButton, Page, PageEmpty, PageHeader } from "@/components/page";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useHabitDialog } from "@/hooks/use-habit-dialog";
import { habitListAtom, useHabitActions, useHabitColor } from "@/hooks/use-habits";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useToday } from "@/hooks/use-now";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, addDays, formatDay, startOfWeek } from "@/lib/dates";
import { progressHint, streakUnit } from "@/lib/habits";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<HabitStatus, string> = { active: "Active", paused: "Paused", archived: "Archived" };
const STATUSES = ["active", "paused", "archived"] as const;

type HabitsSearch = {
  /** Absent means `active`. */
  status?: Exclude<HabitStatus, "active"> | undefined;
};

export const Route = createFileRoute("/_app/habits")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): HabitsSearch => ({
    status: search.status === "paused" || search.status === "archived" ? search.status : undefined,
  }),
  head: () => ({ meta: [{ title: "Habits · Dueboard" }] }),
  component: Habits,
});

function Habits() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = useToday(useTimeZone());
  const status: HabitStatus = search.status ?? "active";
  const result = useAtomValue(habitListAtom);
  const { reload } = useHabitActions();
  const dialog = useHabitDialog();
  useKeyShortcut("n", dialog.openNew);
  const color = useHabitColor();

  const all = AsyncResult.isSuccess(result) ? result.value : undefined;
  const counts = useMemo(() => {
    const byStatus: Record<HabitStatus, number> = { active: 0, paused: 0, archived: 0 };
    for (const summary of all ?? []) byStatus[summary.habit.status] += 1;
    return byStatus;
  }, [all]);
  const shown = (all ?? []).filter((summary) => summary.habit.status === status);

  return (
    <Page>
      <PageHeader title="Habits" description="The things you do again and again, and your streaks.">
        <CreateButton label="New habit" onClick={dialog.openNew} />
      </PageHeader>

      <Tabs
        value={status}
        onValueChange={(value) =>
          void navigate({ search: { status: value === "active" ? undefined : (value as HabitsSearch["status"]) } })
        }
      >
        <TabsList>
          {STATUSES.map((value) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              {STATUS_LABEL[value]}
              {all && (
                <Badge variant="secondary" className="h-4.5 min-w-4.5 px-1 text-xs tabular-nums">
                  {counts[value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {AsyncResult.isFailure(result) ? (
        <PageEmpty icon={RepeatIcon} title="Couldn't load your habits" description="Check your connection, then try again.">
          <Button variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </PageEmpty>
      ) : !all || !today ? (
        <HabitsSkeleton />
      ) : shown.length === 0 ? (
        <PageEmpty icon={RepeatIcon} {...EMPTY[status]}>
          {status === "active" && (
            <Button onClick={dialog.openNew}>
              <PlusIcon />
              New habit
            </Button>
          )}
        </PageEmpty>
      ) : (
        <ul data-tag={color} aria-label={`${STATUS_LABEL[status]} habits`} className="flex flex-col divide-y pb-8">
          {shown.map((summary) => (
            <HabitRow key={summary.habit.id} summary={summary} today={today} onEdit={() => dialog.openHabit(summary.habit)} />
          ))}
        </ul>
      )}

      {today && (
        <HabitDialog
          target={dialog.target}
          open={dialog.open}
          version={dialog.version}
          onOpenChange={dialog.setOpen}
          today={today}
        />
      )}
    </Page>
  );
}

const EMPTY: Record<HabitStatus, { title: string; description: string }> = {
  active: {
    title: "No habits yet",
    description: "Add one with New habit. It shows up on your days with its schedule, and its streak grows here.",
  },
  paused: {
    title: "Nothing paused",
    description: "Pause a habit to take it off your days for a while without breaking its streak.",
  },
  archived: {
    title: "Nothing archived",
    description: "Archive a habit you're done with. It keeps its history and can be restored.",
  },
};

function HabitRow({ summary, today, onEdit }: { summary: HabitSummary; today: LocalDate; onEdit: () => void }) {
  const { habit, progress, streak } = summary;
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-3 py-4 md:grid-cols-[auto_1fr_auto_auto] md:items-center md:gap-x-6">
      <HabitRing done={progress.done} target={progress.target} size={36} className={cn(habit.status !== "active" && "opacity-50")} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onEdit} className="text-left font-medium wrap-break-word outline-none hover:underline focus-visible:underline">
            {habit.title}
          </button>
          {habit.status !== "active" && <Badge variant="outline">{STATUS_LABEL[habit.status]}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{summary.schedule}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {habit.status === "active" && progress.target > 1 && (
            <span>{progressHint(habit, progress, today)}</span>
          )}
          <span className={cn("inline-flex items-center gap-1", streak > 0 && "font-medium text-tag-ink")}>
            <FlameIcon aria-hidden="true" className="size-3" />
            {streak > 0 ? `${streakUnit(habit, streak)} in a row` : "No streak yet"}
          </span>
          {habit.startDate > today && <span>Starts {formatDay(habit.startDate, today)}</span>}
        </p>
      </div>
      <div className="col-span-3 col-start-1 row-start-2 md:col-span-1 md:col-start-3 md:row-start-1">
        <Heatmap summary={summary} today={today} />
      </div>
      <div className="col-start-3 row-start-1 md:col-start-4">
        <HabitActions summary={summary} onEdit={onEdit} />
      </div>
    </li>
  );
}

/**
 * The last 12 weeks of taps: a column per week (Sunday on top), shaded by
 * how much of a day's share of the target was done. Days before the start
 * date are faint; days after today are left blank.
 */
function Heatmap({ summary, today }: { summary: HabitSummary; today: LocalDate }) {
  const { habit, history } = summary;
  const counts = useMemo(() => new Map(history.map((day) => [day.date, day.count])), [history]);
  const first = addDays(startOfWeek(today), -7 * (HABIT_HISTORY_WEEKS - 1));
  // A day's full share: the target itself when it's per day, otherwise any tap.
  const perDay = habit.scheduleKind === "specific_days" || (habit.periodUnit === "day" && habit.periodLength === 1) ? habit.targetCount : 1;
  const days = Array.from({ length: HABIT_HISTORY_WEEKS * 7 }, (_, i) => addDays(first, i));
  const total = history.reduce((sum, day) => sum + day.count, 0);
  const activeDays = history.filter((day) => day.count > 0).length;

  return (
    <div
      role="img"
      aria-label={`${total} check-ins on ${activeDays} days over the last ${HABIT_HISTORY_WEEKS} weeks`}
      className="grid w-fit grid-flow-col grid-rows-7 gap-0.5 max-md:mx-auto"
    >
      {days.map((day) => {
        const count = counts.get(day) ?? 0;
        return (
          <span
            key={day}
            title={day <= today ? `${formatDay(day, today)}: ${count === 1 ? "1 check-in" : `${count} check-ins`}` : undefined}
            className={cn(
              "size-2.5 rounded-[3px]",
              day > today
                ? "bg-transparent"
                : count >= perDay
                  ? "bg-tag"
                  : count > 0
                    ? "bg-tag/45"
                    : day < habit.startDate
                      ? "bg-primary/5 dark:bg-white/4"
                      : "bg-primary/12 dark:bg-white/10",
              day === today && "ring-1 ring-foreground/40 ring-offset-1 ring-offset-background",
            )}
          />
        );
      })}
    </div>
  );
}

/** Edit, pause or resume, archive or restore, and delete (after a confirmation). */
function HabitActions({ summary, onEdit }: { summary: HabitSummary; onEdit: () => void }) {
  const { habit } = summary;
  const actions = useHabitActions();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (call: () => Promise<Exit.Exit<unknown, unknown>>, done: string, failed: string) => {
    const exit = await call();
    if (Exit.isSuccess(exit)) toast(done);
    else toast.error(failureMessage(exit, failed));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`More for "${habit.title}"`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Edit habit
          </DropdownMenuItem>
          {habit.status === "active" && (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.pause(habit.id), `Paused "${habit.title}"`, "Couldn't pause the habit.")}
            >
              <PauseIcon />
              Pause
            </DropdownMenuItem>
          )}
          {habit.status === "paused" && (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.resume(habit.id), `Resumed "${habit.title}"`, "Couldn't resume the habit.")}
            >
              <PlayIcon />
              Resume
            </DropdownMenuItem>
          )}
          {habit.status === "archived" ? (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.resume(habit.id), `Restored "${habit.title}"`, "Couldn't restore the habit.")}
            >
              <PlayIcon />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.archive(habit.id), `Archived "${habit.title}"`, "Couldn't archive the habit.")}
            >
              <ArchiveIcon />
              Archive
            </DropdownMenuItem>
          )}
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
            <AlertDialogTitle>Delete this habit?</AlertDialogTitle>
            <AlertDialogDescription>
              “{habit.title}” will be removed with all its check-ins and its streak, including its place in your diary
              and Live. To keep its history, archive it instead. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault();
                setBusy(true);
                const exit = await actions.remove(habit.id);
                setBusy(false);
                if (Exit.isSuccess(exit)) {
                  setConfirming(false);
                  toast("Habit deleted");
                } else {
                  toast.error(failureMessage(exit, "Couldn't delete the habit."));
                }
              }}
            >
              Delete habit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HabitsSkeleton() {
  return (
    <div className="flex flex-col divide-y" aria-hidden="true">
      {[60, 40, 52].map((width) => (
        <div key={width} className="flex items-center gap-3 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
