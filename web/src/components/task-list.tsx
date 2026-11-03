import type { Tag, Task, TaskStatus } from "@dueboard/api/rpc";
import { CalendarIcon, ClockIcon, FlagIcon, StarIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TagChip } from "@/components/tag-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { type LocalDate, formatDay } from "@/lib/dates";
import { IMPORTANCE_LABEL, deadlineLabel, formatMinutes, isOverdue } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// Task rows: a settle checkbox, the title, then only the fields that are
// set. The same rows fill `/now` and `/tasks`; a click opens the task card.

/** How long a checked row lingers, struck through, before it moves to Settled. */
const SETTLE_LINGER_MS = 320;

const rowTransition = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

type RowProps = {
  readonly task: Task;
  /** `task.status` with the user's latest click applied. */
  readonly status: TaskStatus;
  readonly tag: Tag | undefined;
  readonly today: LocalDate;
  /** Show the assigned date (lists that aren't grouped by day). */
  readonly showAssigned?: boolean;
  readonly onStatusChange: (task: Task, status: TaskStatus) => void;
  readonly onOpen: (task: Task) => void;
};

/**
 * A list of task rows. Rows share `layoutId`s across lists in the same
 * `LayoutGroup`, so a settled row flies into the Settled list when that list
 * is showing, and folds away toward it when it isn't.
 */
export function TaskList({
  tasks,
  label,
  statusOf,
  tags,
  ...row
}: Omit<RowProps, "task" | "status" | "tag"> & {
  readonly tasks: readonly Task[];
  readonly label: string;
  readonly statusOf: (task: Task) => TaskStatus;
  readonly tags: ReadonlyMap<string, Tag>;
}) {
  return (
    <ul aria-label={label} className="flex flex-col">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} status={statusOf(task)} tag={tags.get(task.tagId)} {...row} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function TaskRow({ task, status, tag, today, showAssigned, onStatusChange, onOpen }: RowProps) {
  const settled = status === "settled";
  // Checked but not yet moved: the row shows its check and strike for a
  // moment, so the move reads as the result of the click.
  const [lingering, setLingering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const checked = settled || lingering;

  const toggle = (next: boolean) => {
    clearTimeout(timer.current);
    if (!next) {
      setLingering(false);
      onStatusChange(task, "idle");
      return;
    }
    setLingering(true);
    timer.current = setTimeout(() => {
      setLingering(false);
      onStatusChange(task, "settled");
    }, SETTLE_LINGER_MS);
  };

  const overdue = isOverdue({ ...task, status }, today);
  const showTag = tag && tag.systemKind !== "default";

  return (
    <motion.li
      layout="position"
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, y: 12, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
      transition={rowTransition}
      className="overflow-hidden"
    >
      <div
        className={cn(
          "group/task flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60",
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => toggle(value === true)}
          aria-label={checked ? `Reopen "${task.title}"` : `Settle "${task.title}"`}
          className="mt-0.5 size-4.5! rounded-full! border-muted-foreground/50! data-checked:border-success! data-checked:bg-success! data-checked:text-background! dark:data-checked:text-background!"
        />
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none"
        >
          <span
            className={cn(
              "text-sm leading-5 wrap-break-word transition-colors duration-200",
              checked && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {task.title}
          </span>
          <TaskMeta
            task={task}
            status={status}
            tag={showTag ? tag : undefined}
            today={today}
            overdue={overdue}
            showAssigned={showAssigned}
          />
        </button>
      </div>
    </motion.li>
  );
}

/** The set fields, and nothing for the unset ones. Renders nothing when none are set. */
export function TaskMeta({
  task,
  status,
  tag,
  today,
  overdue,
  showAssigned,
}: {
  task: Task;
  status: TaskStatus;
  tag: Tag | undefined;
  today: LocalDate;
  overdue: boolean;
  showAssigned: boolean | undefined;
}) {
  const working = status === "working";
  const assigned = showAssigned ? task.assignedDate : null;
  if (
    !tag &&
    !task.importance &&
    !task.expectedMinutes &&
    !task.deadlineDate &&
    !working &&
    !assigned
  )
    return null;

  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
      {working && (
        <span className="inline-flex items-center gap-1.5 font-medium text-primary">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
          Working
        </span>
      )}
      {tag && <TagChip name={tag.name} color={tag.color} />}
      {assigned && (
        <span className="inline-flex items-center gap-1">
          <CalendarIcon aria-hidden="true" className="size-3" />
          {formatDay(assigned, today)}
        </span>
      )}
      {task.deadlineDate && (
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full px-1.5 font-medium",
            overdue
              ? "bg-destructive/10 text-destructive"
              : task.deadlineDate === today && status !== "settled"
                ? "bg-due text-due-foreground"
                : "bg-muted",
          )}
        >
          <FlagIcon aria-hidden="true" className="size-3" />
          {deadlineLabel(task.deadlineDate, today)}
        </span>
      )}
      {task.importance !== null && <Stars value={task.importance} />}
      {task.expectedMinutes !== null && (
        <span className="inline-flex items-center gap-1">
          <ClockIcon aria-hidden="true" className="size-3" />
          {formatMinutes(task.expectedMinutes)}
        </span>
      )}
    </span>
  );
}

/** A task's importance in a row: a star and its 1–5 level on a soft amber pill. */
function Stars({ value }: { value: number }) {
  const label = IMPORTANCE_LABEL[value - 1] ?? "";
  return (
    <span
      role="img"
      aria-label={`Importance ${value} of 5, ${label.toLowerCase()}`}
      title={`${label} importance`}
      className="inline-flex h-5 items-center gap-1 rounded-full bg-importance-soft pr-1.5 pl-1 font-semibold text-importance-ink tabular-nums"
    >
      <StarIcon aria-hidden="true" className="size-3 fill-importance text-importance" />
      {value}
    </span>
  );
}
