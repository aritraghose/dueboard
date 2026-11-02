import { type Goal, type GoalStatus, type GoalSummary } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as Exit from "effect/Exit";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  CheckSquareIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  RotateCcwIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeleteGoalDialog, GoalDialog } from "@/components/goal-dialog";
import { GoalBar, GoalCheck, GoalMeta, GoalSlider } from "@/components/goal-progress";
import { CreateButton, Page, PageEmpty, PageHeader } from "@/components/page";
import { AlertDialog } from "@/components/ui/alert-dialog";
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
import { useGoalDialog } from "@/hooks/use-goal-dialog";
import { goalListAtom, useGoalActions, useGoalColor, useGoalProgress, useJustCompleted } from "@/hooks/use-goals";
import { useKeyShortcut } from "@/hooks/use-key-shortcut";
import { useToday } from "@/hooks/use-now";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, formatDay, localDateOf } from "@/lib/dates";
import { amountHint, roundPercent } from "@/lib/goals";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<GoalStatus, string> = { active: "Active", paused: "Paused", completed: "Completed" };
const STATUSES: readonly GoalStatus[] = ["active", "paused", "completed"];

type GoalsSearch = {
  /** Absent means `active`. */
  status?: Exclude<GoalStatus, "active"> | undefined;
};

export const Route = createFileRoute("/_app/goals")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): GoalsSearch => ({
    status: search.status === "paused" || search.status === "completed" ? search.status : undefined,
  }),
  head: () => ({ meta: [{ title: "Goals · Dueboard" }] }),
  component: Goals,
});

function Goals() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const status: GoalStatus = search.status ?? "active";
  const result = useAtomValue(goalListAtom);
  const { reload } = useGoalActions();
  const progress = useGoalProgress();
  const dialog = useGoalDialog();
  useKeyShortcut("n", dialog.openNew);
  const color = useGoalColor();

  const all = AsyncResult.isSuccess(result)
    ? result.value.map((summary) => ({ ...summary, goal: progress.shown(summary.goal) }) as GoalSummary)
    : undefined;
  const celebrating = useJustCompleted(all?.map((summary) => summary.goal) ?? []);
  const counts = useMemo(() => {
    const byStatus: Record<GoalStatus, number> = { active: 0, paused: 0, completed: 0 };
    for (const summary of all ?? []) byStatus[summary.goal.status] += 1;
    return byStatus;
  }, [all]);
  // A goal completed here stays in Active for its celebration.
  const shown = (all ?? []).filter(
    (summary) => summary.goal.status === status || (status === "active" && celebrating.has(summary.goal.id)),
  );

  return (
    <Page>
      <PageHeader title="Goals" description="Where you're headed, and how far you've come.">
        <CreateButton label="New goal" onClick={dialog.openNew} />
      </PageHeader>

      <Tabs
        value={status}
        onValueChange={(value) =>
          void navigate({ search: { status: value === "active" ? undefined : (value as GoalsSearch["status"]) } })
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
        <PageEmpty icon={TargetIcon} title="Couldn't load your goals" description="Check your connection, then try again.">
          <Button variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </PageEmpty>
      ) : !all || !today ? (
        <GoalsSkeleton />
      ) : shown.length === 0 ? (
        <PageEmpty icon={TargetIcon} {...EMPTY[status]}>
          {status === "active" && (
            <Button onClick={dialog.openNew}>
              <PlusIcon />
              New goal
            </Button>
          )}
        </PageEmpty>
      ) : (
        <ul data-tag={color} aria-label={`${STATUS_LABEL[status]} goals`} className="flex flex-col divide-y pb-8">
          {shown.map((summary) => (
            <GoalRow
              key={summary.goal.id}
              summary={summary}
              today={today}
              timeZone={timeZone}
              celebrate={celebrating.has(summary.goal.id)}
              onIncrement={() => void progress.increment(summary.goal)}
              onSlide={(value) => progress.slide(summary.goal, value)}
              onEdit={() => dialog.openGoal(summary.goal)}
            />
          ))}
        </ul>
      )}

      {today && (
        <GoalDialog
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

const EMPTY: Record<GoalStatus, { title: string; description: string }> = {
  active: {
    title: "No goals yet",
    description:
      "Add one with New goal. Count goals can move on their own: link a habit or task, and each check-in or settle adds to it.",
  },
  paused: {
    title: "Nothing paused",
    description: "Pause a goal to take it off your days for a while. Linked habits and tasks still move it.",
  },
  completed: {
    title: "Nothing completed yet",
    description: "Goals land here when they reach their target. You can reopen one to keep going.",
  },
};

function GoalRow({
  summary,
  today,
  timeZone,
  celebrate,
  onIncrement,
  onSlide,
  onEdit,
}: {
  summary: GoalSummary;
  today: LocalDate;
  timeZone: string;
  celebrate: boolean;
  onIncrement: () => void;
  onSlide: (value: number) => void;
  onEdit: () => void;
}) {
  const { goal, links } = summary;
  const done = goal.status === "completed";
  const live = goal.status === "active";
  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-3 py-4 md:grid-cols-[1fr_13rem_auto] md:gap-x-8">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {done && <GoalCheck celebrate={celebrate} />}
          <button
            type="button"
            onClick={onEdit}
            className="text-left font-medium wrap-break-word outline-none hover:underline focus-visible:underline"
          >
            {goal.name}
          </button>
          {goal.status === "paused" && <Badge variant="outline">Paused</Badge>}
        </div>

        <div className="flex items-center gap-3">
          {live && goal.progressMode === "slider" ? (
            <GoalSlider value={goal.progressPercent} label={`${goal.name} progress`} onChange={onSlide} className="flex-1" />
          ) : (
            <GoalBar goal={goal} celebrate={celebrate} className={cn("flex-1", goal.status === "paused" && "opacity-60")} />
          )}
          <span className={cn("w-10 text-right text-sm font-semibold tabular-nums", done ? "text-success" : "text-tag-ink")}>
            {roundPercent(goal)}%
          </span>
          {live && goal.progressMode === "count" && (
            <Button size="xs" className="-my-1 bg-tag! text-primary-foreground! hover:bg-tag/85!" aria-label={`Move "${goal.name}" forward by one`} onClick={onIncrement}>
              <PlusIcon />
              Move Goal
            </Button>
          )}
        </div>

        <GoalMeta goal={goal} today={today} />
        {done && goal.completedAt && (
          <p className="text-xs text-success">Completed {formatDay(localDateOf(goal.completedAt, timeZone), today)}</p>
        )}

        {links.length > 0 && (
          <ul aria-label="Linked habits and tasks" className="flex flex-wrap gap-1.5">
            {links.map((link) => (
              <li
                key={link.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
              >
                {link.itemType === "habit" ? <RepeatIcon aria-label="Habit" /> : <CheckSquareIcon aria-label="Task" />}
                <span className="truncate">{link.itemTitle}</span>
                <span className="text-muted-foreground tabular-nums">{amountHint(link.itemType, link.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
        <ProgressLine summary={summary} today={today} timeZone={timeZone} />
      </div>

      <div className="col-start-2 row-start-1 md:col-start-3">
        <GoalActions goal={goal} onEdit={onEdit} />
      </div>
    </li>
  );
}

const LINE_WIDTH = 208;
const LINE_HEIGHT = 44;

/**
 * Progress over time, from the goal's latest progress events: a stepped
 * line (the value holds until the next change) running to now, over a soft
 * fill, scaled to the target (or 100%). Plain SVG.
 */
function ProgressLine({ summary, today, timeZone }: { summary: GoalSummary; today: LocalDate; timeZone: string }) {
  const { goal, events } = summary;
  const points = useMemo(() => {
    const ordered = [...events].reverse();
    const first = ordered[0];
    if (!first) return [];
    const start = { t: first.createdAt.getTime() - 1, v: first.valueAfter - first.delta };
    return [start, ...ordered.map((event) => ({ t: event.createdAt.getTime(), v: event.valueAfter }))];
  }, [events]);

  if (points.length === 0) {
    return (
      <p className="flex h-11 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground md:justify-start md:px-3">
        No progress yet
      </p>
    );
  }

  const end = Math.max(Date.now(), points[points.length - 1]!.t + 1);
  const t0 = points[0]!.t;
  const top =
    goal.progressMode === "count"
      ? Math.max(goal.targetCount ?? 1, ...points.map((point) => point.v), 1)
      : 100;
  const pad = 3;
  const x = (t: number) => ((t - t0) / (end - t0)) * LINE_WIDTH;
  const y = (v: number) => LINE_HEIGHT - pad - (Math.max(0, v) / top) * (LINE_HEIGHT - pad * 2);
  const line = points
    .map((point, index) => (index === 0 ? `M0 ${y(point.v)}` : `H${x(point.t)} V${y(point.v)}`))
    .join(" ")
    .concat(` H${LINE_WIDTH}`);
  const area = `${line} V${LINE_HEIGHT} H0 Z`;
  const firstValue = points[0]!.v;
  const lastValue = points[points.length - 1]!.v;
  const unit = goal.progressMode === "count" ? "" : "%";
  const since = formatDay(localDateOf(new Date(t0), timeZone), today);

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Progress from ${firstValue}${unit} to ${lastValue}${unit} over the last ${events.length} changes, since ${since}`}
        className={cn("h-11 w-full overflow-visible", goal.status === "completed" ? "text-success" : "text-tag")}
      >
        {goal.progressMode === "count" && goal.targetCount !== null && (
          <line
            x1={0}
            x2={LINE_WIDTH}
            y1={y(goal.targetCount)}
            y2={y(goal.targetCount)}
            className="stroke-border"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={area} className="fill-current opacity-12" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between text-[0.6875rem] text-muted-foreground">
        <span>{since}</span>
        <span>Now</span>
      </figcaption>
    </figure>
  );
}

/** Edit, pause or resume, reopen, and delete (after a confirmation). */
function GoalActions({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const actions = useGoalActions();
  const [confirming, setConfirming] = useState(false);

  const act = async (call: () => Promise<Exit.Exit<unknown, unknown>>, done: string, failed: string) => {
    const exit = await call();
    if (Exit.isSuccess(exit)) toast(done);
    else toast.error(failureMessage(exit, failed));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`More for "${goal.name}"`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Edit goal
          </DropdownMenuItem>
          {goal.status === "active" && (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.pause(goal.id), `Paused "${goal.name}"`, "Couldn't pause the goal.")}
            >
              <PauseIcon />
              Pause
            </DropdownMenuItem>
          )}
          {goal.status === "paused" && (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.resume(goal.id), `Resumed "${goal.name}"`, "Couldn't resume the goal.")}
            >
              <PlayIcon />
              Resume
            </DropdownMenuItem>
          )}
          {goal.status === "completed" && (
            <DropdownMenuItem
              onSelect={() => void act(() => actions.reopen(goal.id), `Reopened "${goal.name}"`, "Couldn't reopen the goal.")}
            >
              <RotateCcwIcon />
              Reopen
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
        <DeleteGoalDialog goal={goal} onOpenChange={setConfirming} />
      </AlertDialog>
    </>
  );
}

function GoalsSkeleton() {
  return (
    <div className="flex flex-col divide-y" aria-hidden="true">
      {[60, 40, 52].map((width) => (
        <div key={width} className="flex flex-col gap-2.5 py-4">
          <Skeleton className="h-4" style={{ width: `${width}%` }} />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
