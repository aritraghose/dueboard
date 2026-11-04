import { type Goal, goalPercent } from "@dueboard/api/rpc";
import * as Exit from "effect/Exit";
import { CalendarClockIcon, CheckIcon, MoreHorizontalIcon, PauseIcon, PencilIcon, PlusIcon, RotateCcwIcon, TargetIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { type DayGoals, useGoalActions, useGoalColor } from "@/hooks/use-goals";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, formatDay } from "@/lib/dates";
import { progressText, roundPercent, targetDateHint } from "@/lib/goals";
import { cn } from "@/lib/utils";

const cardTransition = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

export function GoalBar({
  goal,
  celebrate = false,
  className,
}: {
  goal: Goal;
  celebrate?: boolean;
  className?: string;
}) {
  const percent = goalPercent(goal);
  const done = goal.status === "completed";
  return (
    <div
      role="progressbar"
      aria-label={`${goal.name}: ${progressText(goal)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("relative h-2 overflow-hidden rounded-full", done ? "bg-success/15" : "bg-tag/15", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
          done ? "bg-success" : "bg-tag",
        )}
        style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }}
      />
      {celebrate && (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-goal-sweep bg-linear-to-r from-transparent via-white/70 to-transparent dark:via-white/40"
        />
      )}
    </div>
  );
}

export function GoalSlider({
  value,
  label,
  onChange,
  className,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <Slider
      value={[value]}
      min={0}
      max={100}
      step={1}
      aria-label={label}
      onValueChange={([value]) => value !== undefined && onChange(value)}
      className={cn(
        "py-1.5 [&_[data-slot=slider-range]]:bg-tag! [&_[data-slot=slider-thumb]]:border-tag! [&_[data-slot=slider-track]]:h-2! [&_[data-slot=slider-track]]:bg-tag/15!",
        className,
      )}
    />
  );
}

export function GoalMeta({ goal, today, className }: { goal: Goal; today: LocalDate; className?: string }) {
  const late = goal.targetDate !== null && goal.status !== "completed" && goal.targetDate < today;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground", className)}>
      {goal.progressMode === "count" && <span className="tabular-nums">{progressText(goal)}</span>}
      {goal.targetDate && (
        <span
          className={cn("inline-flex items-center gap-1", late && "text-destructive")}
          title={`Target ${formatDay(goal.targetDate, today)}`}
        >
          <CalendarClockIcon aria-hidden="true" className="size-3" />
          {goal.status === "completed" ? `Target ${formatDay(goal.targetDate, today)}` : targetDateHint(goal.targetDate, today)}
        </span>
      )}
    </span>
  );
}

export function GoalCheck({ celebrate, size = "md" }: { celebrate: boolean; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-success text-background",
        size === "md" ? "size-5" : "size-4",
      )}
    >
      {celebrate && (
        <>
          <span aria-hidden="true" className="absolute inset-0 animate-habit-burst rounded-full border-2 border-success" />
          <span
            aria-hidden="true"
            className="absolute inset-0 animate-habit-burst rounded-full border border-success [animation-delay:180ms]"
          />
        </>
      )}
      <CheckIcon className={size === "md" ? "size-3" : "size-2.5"} strokeWidth={3} />
    </span>
  );
}

function GoalDoneMark() {
  return (
    <span aria-label="Completed goal" role="img" className="relative grid size-5 shrink-0 place-items-center rounded-full bg-tag/15 text-tag">
      <TargetIcon aria-hidden="true" className="size-3.5" />
      <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-success text-background ring-2 ring-card">
        <CheckIcon aria-hidden="true" className="size-2" strokeWidth={4} />
      </span>
    </span>
  );
}

export function DayGoalCards({
  goals,
  today,
  onEdit,
}: {
  goals: DayGoals;
  today: LocalDate;
  onEdit: (goal: Goal) => void;
}) {
  const color = useGoalColor();
  const shown = [...goals.active, ...goals.completed.filter((goal) => goals.celebrating.has(goal.id))];
  return (
    <ul data-tag={color} aria-label="Goals" className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {shown.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            today={today}
            celebrate={goals.celebrating.has(goal.id)}
            onIncrement={() => void goals.increment(goal)}
            onSlide={(value) => goals.slide(goal, value)}
            onEdit={onEdit}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function GoalCard({
  goal,
  today,
  celebrate,
  onIncrement,
  onSlide,
  onEdit,
}: {
  goal: Goal;
  today: LocalDate;
  celebrate: boolean;
  onIncrement: () => void;
  onSlide: (value: number) => void;
  onEdit: (goal: Goal) => void;
}) {
  const done = goal.status === "completed";
  const canMove = goal.progressMode === "count" && !done;
  return (
    <motion.li
      layout="position"
      layoutId={`goal-${goal.id}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, y: 10, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
      transition={cardTransition}
      className="flex flex-col"
    >
      <div
        className={cn(
          "relative z-10 flex flex-col gap-2 rounded-xl border border-sidebar-border bg-sidebar px-3 py-2.5 text-sidebar-foreground transition-colors",
          canMove && "rounded-br-none",
          done && "border-success/40",
        )}
      >
        <div className="flex items-start gap-2">
          {done && (
            <span className="pt-0.5">
              <GoalCheck celebrate={celebrate} />
            </span>
          )}
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className="min-w-0 flex-1 pt-0.5 text-left text-sm leading-5 font-medium wrap-break-word outline-none hover:underline focus-visible:underline"
          >
            {goal.name}
          </button>
          <span className={cn("pt-0.5 text-sm font-semibold tabular-nums", done ? "text-success" : "text-tag-ink")}>
            {roundPercent(goal)}%
          </span>
          <div className="-my-0.5 -mr-1.5 flex items-center">
            <GoalMenu goal={goal} onEdit={onEdit} />
          </div>
        </div>
        {goal.progressMode === "slider" && !done ? (
          <GoalSlider value={goal.progressPercent} label={`${goal.name} progress`} onChange={onSlide} />
        ) : (
          <GoalBar goal={goal} celebrate={celebrate} />
        )}
        {(goal.progressMode === "count" || goal.targetDate) && <GoalMeta goal={goal} today={today} />}
      </div>
      {canMove && (
        <button
          type="button"
          aria-label={`Move "${goal.name}" forward by one`}
          onClick={() => {
            onIncrement();
            const next = (goal.currentCount ?? 0) + 1;
            if (next === goal.targetCount) toast(`${goal.name}: target reached`, { id: `goal-${goal.id}` });
          }}
          className="-mt-px inline-flex items-center gap-1 self-end rounded-b-lg border border-t-0 border-goal-move bg-goal-move px-2.5 pt-1 pb-1.5 text-xs font-medium text-goal-move-foreground transition-colors outline-none hover:bg-goal-move/85 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px [&_svg]:size-3.5"
        >
          <PlusIcon aria-hidden="true" />
          Move Goal
        </button>
      )}
    </motion.li>
  );
}

function GoalMenu({ goal, onEdit }: { goal: Goal; onEdit: (goal: Goal) => void }) {
  const actions = useGoalActions();
  const pause = async () => {
    const exit = await actions.pause(goal.id);
    if (Exit.isFailure(exit)) {
      toast.error(failureMessage(exit, "Couldn't pause the goal."));
      return;
    }
    toast(`Paused "${goal.name}"`, {
      description: "It's off your days until you resume it.",
      action: {
        label: "Undo",
        onClick: async () => {
          const undone = await actions.resume(goal.id);
          if (Exit.isFailure(undone)) toast.error(failureMessage(undone, "Couldn't resume the goal."));
        },
      },
    });
  };
  const reopen = async () => {
    const exit = await actions.reopen(goal.id);
    if (Exit.isFailure(exit)) toast.error(failureMessage(exit, "Couldn't reopen the goal."));
    else toast(`Reopened "${goal.name}"`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`More for "${goal.name}"`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(goal)}>
          <PencilIcon />
          Edit goal
        </DropdownMenuItem>
        {goal.status === "active" && (
          <DropdownMenuItem onSelect={() => void pause()}>
            <PauseIcon />
            Pause goal
          </DropdownMenuItem>
        )}
        {goal.status === "completed" && (
          <DropdownMenuItem onSelect={() => void reopen()}>
            <RotateCcwIcon />
            Reopen goal
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CompletedGoals({
  goals,
  today,
  onEdit,
  emptyText,
}: {
  goals: DayGoals;
  today: LocalDate;
  onEdit: (goal: Goal) => void;
  emptyText: string;
}) {
  const color = useGoalColor();
  const rows = goals.completed.filter((goal) => !goals.celebrating.has(goal.id));
  if (rows.length === 0) {
    if (!emptyText) return null;
    return <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul data-tag={color} aria-label="Completed goals" className="flex flex-col">
      <AnimatePresence initial={false}>
        {rows.map((goal) => (
          <motion.li
            key={goal.id}
            layout="position"
            layoutId={`goal-${goal.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={cardTransition}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <GoalDoneMark />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-muted-foreground">{goal.name}</span>
                <span className="text-xs text-muted-foreground/80">
                  {goal.progressMode === "count" ? `Reached ${progressText(goal)}` : "Reached 100%"}
                </span>
              </span>
              <GoalMenu goal={goal} onEdit={onEdit} />
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
