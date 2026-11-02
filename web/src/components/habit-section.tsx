import type { Habit } from "@dueboard/api/rpc";
import * as Exit from "effect/Exit";
import { CheckIcon, EyeIcon, FlameIcon, MoreHorizontalIcon, PauseIcon, PencilIcon, Undo2Icon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { HabitRing } from "@/components/habit-ring";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type DayHabits, type ShownHabit, useHabitActions, useHabitColor } from "@/hooks/use-habits";
import { failureMessage } from "@/hooks/use-tasks";
import { type LocalDate, formatDay } from "@/lib/dates";
import { checkInWindow, oldestCheckInDay, progressHint } from "@/lib/habits";
import { cn } from "@/lib/utils";

// `/now`'s habits for the selected day. A due habit is a card: tapping it
// adds a check-in, its ring fills a segment, and once the target is met it
// lingers full for a moment and moves to Settled. Undo is the small arrow on
// the card, the "Undo" in the toast, or the arrow on a settled row. Every
// habit wears the `habit` tag's color.

const cardTransition = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

/**
 * The due cards, one per row, then "All habits checked" when nothing is
 * left (unless `allChecked` is off, as in `/now`'s All view, where the
 * habits tab says it).
 */
export function DueHabits({
  habits,
  date,
  today,
  onEdit,
  allChecked = true,
}: {
  habits: DayHabits;
  date: LocalDate;
  today: LocalDate;
  onEdit: (habit: Habit) => void;
  allChecked?: boolean;
}) {
  const color = useHabitColor();
  const checkIns = checkInWindow(date, today);
  return (
    <div data-tag={color} className="flex flex-col gap-3">
      {checkIns !== "open" && habits.due.length > 0 && (
        <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <EyeIcon aria-hidden="true" className="size-3.5" />
          {checkIns === "future"
            ? "What will be due. Check-ins open on the day."
            : `Check-ins reach back to ${formatDay(oldestCheckInDay(today), today)}.`}
        </p>
      )}
      {habits.allChecked ? (
        allChecked && <AllChecked count={habits.settled.length} celebrate={habits.celebrate} />
      ) : (
        <ul aria-label="Habits due" className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {habits.due.map((habit) => (
              <HabitCard
                key={habit.entry.habit.id}
                habit={habit}
                today={today}
                readOnly={checkIns !== "open"}
                pop={habits.touched.has(habit.entry.habit.id)}
                onTap={habits.tap}
                onEdit={onEdit}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function HabitCard({
  habit,
  today,
  readOnly,
  pop,
  onTap,
  onEdit,
}: {
  habit: ShownHabit;
  today: LocalDate;
  readOnly: boolean;
  pop: boolean;
  onTap: DayHabits["tap"];
  onEdit: (habit: Habit) => void;
}) {
  const { entry, done, countOnDay, complete } = habit;
  const { habit: rule, progress } = entry;
  const hint = progressHint(rule, { ...progress, done }, today);

  const checkIn = () => {
    if (readOnly || complete) return;
    void onTap(habit, 1);
    const after = done + 1;
    toast(after >= progress.target ? `${rule.title}: done` : `${rule.title}: ${after} of ${progress.target}`, {
      id: `habit-${rule.id}`,
      action: { label: "Undo", onClick: () => void onTap({ ...habit, done: after, countOnDay: countOnDay + 1 }, -1) },
    });
  };

  const body = (
    <>
      <span key={pop ? done : "still"} className={cn("inline-flex", pop && "animate-ring-pop")}>
        <HabitRing done={done} target={progress.target} size={32} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 font-medium wrap-break-word">{rule.title}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
          {progress.target > 1 ? hint : entry.schedule}
          {entry.streak > 0 && <Streak count={entry.streak} />}
        </span>
      </span>
    </>
  );

  return (
    <motion.li
      layout="position"
      layoutId={`habit-${rule.id}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, y: 10, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
      transition={cardTransition}
      className="group/habit relative"
    >
      {readOnly ? (
        <div className={cn(cardClass, "opacity-80")}>{body}</div>
      ) : (
        <button
          type="button"
          onClick={checkIn}
          aria-label={`Check in "${rule.title}", ${hint}`}
          className={cn(
            cardClass,
            "cursor-pointer transition-[background-color,transform,border-color] hover:border-tag/40 hover:bg-sidebar-accent/50 active:scale-[0.99]",
            complete && "border-tag/50",
          )}
        >
          {body}
        </button>
      )}
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
        {!readOnly && countOnDay > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Undo a check-in of "${rule.title}"`}
            title="Undo a check-in"
            onClick={() => void onTap(habit, -1)}
          >
            <Undo2Icon />
          </Button>
        )}
        <HabitMenu habit={rule} onEdit={onEdit} />
      </div>
    </motion.li>
  );
}

const cardClass =
  "flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar py-2 pr-16 pl-2.5 text-left text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Streak({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-tag-ink" title={`${count} in a row`}>
      <FlameIcon aria-hidden="true" className="size-3" />
      {count} in a row
    </span>
  );
}

/** Edit or pause, from a card's corner. */
function HabitMenu({ habit, onEdit }: { habit: Habit; onEdit: (habit: Habit) => void }) {
  const actions = useHabitActions();
  const pause = async () => {
    const exit = await actions.pause(habit.id);
    if (Exit.isFailure(exit)) {
      toast.error(failureMessage(exit, "Couldn't pause the habit."));
      return;
    }
    toast(`Paused "${habit.title}"`, {
      description: "It's off your days until you resume it.",
      action: {
        label: "Undo",
        onClick: async () => {
          const undone = await actions.resume(habit.id);
          if (Exit.isFailure(undone)) toast.error(failureMessage(undone, "Couldn't resume the habit."));
        },
      },
    });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`More for "${habit.title}"`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(habit)}>
          <PencilIcon />
          Edit habit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pause()}>
          <PauseIcon />
          Pause habit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Every due habit is done. When the user's own tap got here, rings spread
 * from the check once; with reduced motion it just appears.
 */
function AllChecked({ count, celebrate }: { count: number; celebrate: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      role="status"
      initial={celebrate && !reduced ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="flex flex-col items-center gap-2 rounded-xl border border-tag/20 bg-tag-soft/40 px-4 py-6 text-center"
    >
      <span className="relative grid size-12 place-items-center rounded-full bg-tag text-background">
        {celebrate && !reduced && (
          <>
            <span aria-hidden="true" className="absolute inset-0 animate-habit-burst rounded-full border-2 border-tag" />
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-habit-burst rounded-full border border-tag [animation-delay:160ms]"
            />
          </>
        )}
        <CheckIcon className="size-6" strokeWidth={3} />
      </span>
      <p className="font-medium text-success">All habits checked</p>
      <p className="text-xs text-muted-foreground">
        {count === 1 ? "The one habit due is done." : `All ${count} habits due are done.`}
      </p>
    </motion.div>
  );
}

/** The day's completed habits: compact rows, each with an undo. */
export function SettledHabits({
  habits,
  date,
  today,
  emptyText,
}: {
  habits: DayHabits;
  date: LocalDate;
  today: LocalDate;
  emptyText: string;
}) {
  const color = useHabitColor();
  const readOnly = checkInWindow(date, today) !== "open";
  if (habits.settled.length === 0) {
    if (!emptyText) return null;
    return <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul data-tag={color} aria-label="Settled habits" className="flex flex-col">
      <AnimatePresence initial={false}>
        {habits.settled.map((habit) => {
          const { entry } = habit;
          return (
            <motion.li
              key={entry.habit.id}
              layout="position"
              layoutId={`habit-${entry.habit.id}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={cardTransition}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <HabitRing done={habit.done} target={entry.progress.target} size={22} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-muted-foreground">{entry.habit.title}</span>
                  <span className="text-xs text-muted-foreground/80">
                    {progressHint(entry.habit, { ...entry.progress, done: habit.done }, today)}
                  </span>
                </span>
                {!readOnly && habit.countOnDay > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label={`Undo a check-in of "${entry.habit.title}"`}
                    title="Undo a check-in"
                    onClick={() => void habits.tap(habit, -1)}
                  >
                    <Undo2Icon />
                  </Button>
                )}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
