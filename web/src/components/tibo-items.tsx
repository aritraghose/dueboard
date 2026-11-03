import type { Goal, Habit, Task } from "@dueboard/api/rpc";
import type { TiboItemRef, TiboReceipt } from "@dueboard/api/tibo";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import {
  CheckIcon,
  CircleAlertIcon,
  FlameIcon,
  NotebookPenIcon,
  TagIcon,
  TimerIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { GoalBar, GoalMeta } from "@/components/goal-progress";
import { GoalDialog } from "@/components/goal-dialog";
import { HabitDialog } from "@/components/habit-dialog";
import { HabitRing } from "@/components/habit-ring";
import { TaskDialog } from "@/components/task-card";
import { TaskMeta } from "@/components/task-list";
import { Checkbox } from "@/components/ui/checkbox";
import { Trace, TraceIcon, TraceLine } from "@/components/ui/trace";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { goalAtom, useGoalColor } from "@/hooks/use-goals";
import { useGoalDialog } from "@/hooks/use-goal-dialog";
import { habitAtom, useHabitColor } from "@/hooks/use-habits";
import { useHabitDialog } from "@/hooks/use-habit-dialog";
import { useToday } from "@/hooks/use-now";
import { useTaskDialog } from "@/hooks/use-task-dialog";
import { taskAtom, useTagMap, useTaskActions } from "@/hooks/use-tasks";
import type { LocalDate } from "@/lib/dates";
import { roundPercent } from "@/lib/goals";
import { isOverdue } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// What Tibo changed, as the items' own cards under its message: a task row,
// a habit with its ring, a goal with its bar, read live, so they show the
// item as it is now. A click opens the same dialog as on `/now`. Notes,
// sessions and tags link to their pages; deleted items keep a struck-through
// card with the name they had.

type Openers = {
  readonly today: LocalDate | null;
  readonly openTask: (task: Task) => void;
  readonly openHabit: (habit: Habit) => void;
  readonly openGoal: (goal: Goal) => void;
};

const ItemsContext = React.createContext<Openers | null>(null);

/** Hosts the task, habit and goal dialogs the cards open, for one thread. */
export function TiboItemsProvider({ children }: { children: React.ReactNode }) {
  const today = useToday(useTimeZone());
  const task = useTaskDialog();
  const habit = useHabitDialog();
  const goal = useGoalDialog();
  const openers = React.useMemo(
    () => ({ today, openTask: task.openTask, openHabit: habit.openHabit, openGoal: goal.openGoal }),
    [today, task.openTask, habit.openHabit, goal.openGoal],
  );
  return (
    <ItemsContext.Provider value={openers}>
      {children}
      {today && (
        <>
          <TaskDialog target={task.target} open={task.open} version={task.version} onOpenChange={task.setOpen} today={today} />
          <HabitDialog
            target={habit.target}
            open={habit.open}
            version={habit.version}
            onOpenChange={habit.setOpen}
            today={today}
          />
          <GoalDialog target={goal.target} open={goal.open} version={goal.version} onOpenChange={goal.setOpen} today={today} />
        </>
      )}
    </ItemsContext.Provider>
  );
}

function useOpeners(): Openers {
  const openers = React.useContext(ItemsContext);
  if (!openers) throw new Error("Tibo's item cards need a TiboItemsProvider");
  return openers;
}

/** The receipts of one Tibo turn: item cards, and plain lines for the rest. */
export function TiboReceipts({ receipts }: { receipts: readonly TiboReceipt[] }) {
  const cards = receipts.filter((receipt) => receipt.item && !receipt.failed);
  const lines = receipts.filter((receipt) => !receipt.item || receipt.failed);
  return (
    <div className="flex w-full flex-col gap-1.5">
      {cards.length > 0 && (
        <ul aria-label="What Tibo changed" className="flex flex-col gap-1.5">
          {cards.map((receipt, index) => (
            <li key={`${receipt.item?.id}-${index}`}>
              <ItemCard receipt={receipt} item={receipt.item as TiboItemRef} />
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <Trace aria-label="What Tibo did" className="gap-1 px-1">
          {lines.map((receipt, index) => (
            <TraceLine key={index} status={receipt.failed ? "error" : undefined} className="text-xs">
              <TraceIcon className={receipt.failed ? undefined : "text-primary"}>
                {receipt.failed ? <CircleAlertIcon /> : <CheckIcon />}
              </TraceIcon>
              <span className="min-w-0">{receipt.text}</span>
            </TraceLine>
          ))}
        </Trace>
      )}
    </div>
  );
}

/** The name in "Created task: Call mom · Tomorrow", for items that can't be read any more. */
const titleOf = (receipt: TiboReceipt) =>
  receipt.item?.title ?? receipt.text.slice(receipt.text.indexOf(":") + 1).split(" · ")[0]?.trim() ?? receipt.text;

function ItemCard({ receipt, item }: { receipt: TiboReceipt; item: TiboItemRef }) {
  if (receipt.verb === "Deleted") return <Gone receipt={receipt} />;
  switch (item.kind) {
    case "task":
      return <TaskItem id={item.id} receipt={receipt} />;
    case "habit":
      return <HabitItem id={item.id} receipt={receipt} />;
    case "goal":
      return <GoalItem id={item.id} receipt={receipt} />;
    case "note":
      return <LinkItem to="/notes" icon={NotebookPenIcon} receipt={receipt} />;
    case "session":
      return <LinkItem to="/sessions" icon={TimerIcon} receipt={receipt} />;
    case "tag":
      return <LinkItem to="/tags" icon={TagIcon} receipt={receipt} />;
  }
}

const shellClass =
  "relative flex w-full items-start gap-3 rounded-xl border border-sidebar-border bg-sidebar py-2 pr-3 pl-2.5 text-left text-sidebar-foreground";

/** What Tibo did to the item, in the card's corner. */
function Verb({ receipt }: { receipt: TiboReceipt }) {
  if (!receipt.verb) return null;
  return (
    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted-foreground">
      {receipt.verb === "Deleted" ? (
        <Trash2Icon aria-hidden="true" className="size-3" />
      ) : (
        <CheckIcon aria-hidden="true" className="size-3 text-primary" />
      )}
      {receipt.verb}
    </span>
  );
}

/** A card's title and meta, as one button that opens the item. */
function Opener({
  onOpen,
  title,
  meta,
  done = false,
}: {
  onOpen: (() => void) | null;
  title: string;
  meta?: React.ReactNode;
  done?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "text-sm leading-5 font-medium wrap-break-word",
          done && "text-muted-foreground line-through decoration-muted-foreground/60",
        )}
      >
        {title}
      </span>
      {meta}
    </>
  );
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 rounded-sm text-left outline-none hover:[&>span:first-child]:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  ) : (
    <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
  );
}

/** Still loading, or gone since: the name Tibo saw, without the live parts. */
function Placeholder({ receipt, gone }: { receipt: TiboReceipt; gone: boolean }) {
  return (
    <div className={cn(shellClass, "items-center")}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm leading-5 font-medium", gone ? "text-muted-foreground" : "animate-pulse")}>
          {titleOf(receipt)}
        </span>
        {gone && <span className="text-xs text-muted-foreground">No longer exists</span>}
      </span>
      <Verb receipt={receipt} />
    </div>
  );
}

function Gone({ receipt }: { receipt: TiboReceipt }) {
  return (
    <div className={cn(shellClass, "items-center border-dashed bg-transparent")}>
      <Trash2Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground line-through decoration-muted-foreground/60">
        {titleOf(receipt)}
      </span>
      <Verb receipt={receipt} />
    </div>
  );
}

function TaskItem({ id, receipt }: { id: string; receipt: TiboReceipt }) {
  const result = useAtomValue(taskAtom(id));
  const { today, openTask } = useOpeners();
  const tags = useTagMap();
  const { setStatus } = useTaskActions();
  if (!AsyncResult.isSuccess(result) || !today) {
    return <Placeholder receipt={receipt} gone={AsyncResult.isFailure(result)} />;
  }
  const task = result.value;
  const settled = task.status === "settled";
  const tag = tags.get(task.tagId);
  return (
    <div className={shellClass}>
      <Checkbox
        checked={settled}
        onCheckedChange={(value) => void setStatus({ id: task.id, status: value === true ? "settled" : "idle" })}
        aria-label={settled ? `Reopen "${task.title}"` : `Settle "${task.title}"`}
        className="mt-0.5 size-4.5! rounded-full! border-muted-foreground/50! data-checked:border-success! data-checked:bg-success! data-checked:text-background! dark:data-checked:text-background!"
      />
      <Opener
        onOpen={() => openTask(task)}
        title={task.title}
        done={settled}
        meta={
          <TaskMeta
            task={task}
            status={task.status}
            tag={tag && tag.systemKind !== "default" ? tag : undefined}
            today={today}
            overdue={isOverdue(task, today)}
            showAssigned
          />
        }
      />
      <Verb receipt={receipt} />
    </div>
  );
}

function HabitItem({ id, receipt }: { id: string; receipt: TiboReceipt }) {
  const result = useAtomValue(habitAtom(id));
  const { openHabit } = useOpeners();
  const color = useHabitColor();
  if (!AsyncResult.isSuccess(result)) return <Placeholder receipt={receipt} gone={AsyncResult.isFailure(result)} />;
  const { habit, schedule, streak, progress } = result.value;
  return (
    <div data-tag={color} className={cn(shellClass, "items-center")}>
      <HabitRing done={progress.done} target={progress.target} size={32} />
      <Opener
        onOpen={() => openHabit(habit)}
        title={habit.title}
        meta={
          <span className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
            {habit.status === "paused" ? "Paused" : schedule}
            <span className="tabular-nums">
              {progress.done} of {progress.target}
            </span>
            {streak > 0 && (
              <span className="inline-flex items-center gap-0.5 font-medium text-tag-ink">
                <FlameIcon aria-hidden="true" className="size-3" />
                {streak}
              </span>
            )}
          </span>
        }
      />
      <Verb receipt={receipt} />
    </div>
  );
}

function GoalItem({ id, receipt }: { id: string; receipt: TiboReceipt }) {
  const result = useAtomValue(goalAtom(id));
  const { today, openGoal } = useOpeners();
  const color = useGoalColor();
  if (!AsyncResult.isSuccess(result) || !today) {
    return <Placeholder receipt={receipt} gone={AsyncResult.isFailure(result)} />;
  }
  const { goal } = result.value;
  const done = goal.status === "completed";
  return (
    <div data-tag={color} className={cn(shellClass, "flex-col gap-2 px-3 py-2.5", done && "border-success/40")}>
      <div className="flex w-full items-start gap-2">
        <Opener onOpen={() => openGoal(goal)} title={goal.name} />
        <span className={cn("text-sm font-semibold tabular-nums", done ? "text-success" : "text-tag-ink")}>
          {roundPercent(goal)}%
        </span>
        <Verb receipt={receipt} />
      </div>
      <GoalBar goal={goal} className="w-full" />
      {(goal.progressMode === "count" || goal.targetDate) && <GoalMeta goal={goal} today={today} />}
    </div>
  );
}

/** Notes, sessions and tags: the name, and a link to their page. */
function LinkItem({ to, icon: Icon, receipt }: { to: "/notes" | "/sessions" | "/tags"; icon: LucideIcon; receipt: TiboReceipt }) {
  return (
    <Link
      to={to}
      className={cn(
        shellClass,
        "items-center outline-none transition-colors hover:bg-sidebar-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-5 font-medium wrap-break-word">{titleOf(receipt)}</span>
      <Verb receipt={receipt} />
    </Link>
  );
}
