import type { Privacy, TagColor } from "@dueboard/api/rpc";
import {
  ArrowLeftRightIcon,
  ArrowUpIcon,
  BellIcon,
  BookOpenIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  FlagIcon,
  FlameIcon,
  HouseIcon,
  LibraryIcon,
  ListChecksIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PauseIcon,
  PlusIcon,
  RadioIcon,
  RepeatIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  StarIcon,
  TargetIcon,
  TimerIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/app-logo";
import { HabitRing } from "@/components/habit-ring";
import { NoteCountdown } from "@/components/note-composer";
import { LiveToggle, PrivacyPill } from "@/components/privacy-controls";
import { TagChip } from "@/components/tag-chip";
import { Segmented } from "@/components/task-fields";
import { TiboMark } from "@/components/tibo-mark";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import { NOTE_BODY_MAX_LENGTH } from "@/lib/notes";
import { cn } from "@/lib/utils";

type DemoTask = {
  readonly id: string;
  readonly title: string;
  readonly tag: string;
  readonly tagColor: TagColor;
  readonly minutes?: number;
  readonly deadline?: string;
  readonly dueToday?: boolean;
  readonly working?: boolean;
  readonly settled: boolean;
  readonly linkedGoal?: boolean;
  readonly importance?: number;
};

type DemoActionId = "add-task" | "focus" | "relay";
type ViewFilter = "all" | "tasks" | "habits" | "goals";
type MobileTab = "day" | "live";
type MobileLiveTab = "all" | "connections" | "mine" | "path";

type DemoBubble = {
  readonly id: string;
  readonly role: "user" | "tibo";
  readonly text: string;
  readonly reaction?: string;
  readonly receipt?: {
    readonly kind: "task" | "session";
    readonly verb: string;
    readonly title: string;
    readonly tag?: { readonly name: string; readonly color: TagColor };
    readonly meta: string;
  };
  readonly relayNote?: string;
};

const INITIAL_TASKS: readonly DemoTask[] = [
  {
    id: "t1",
    title: "Fix OAuth redirect bug before standup",
    tag: "Work",
    tagColor: "teal",
    minutes: 30,
    deadline: "Today",
    dueToday: true,
    working: true,
    settled: false,
    linkedGoal: true,
    importance: 4,
  },
  {
    id: "t2",
    title: "Pick up cupcakes for Maya's birthday",
    tag: "Family",
    tagColor: "amber",
    minutes: 20,
    deadline: "Today",
    dueToday: true,
    settled: false,
    importance: 5,
  },
  {
    id: "t3",
    title: "Read bedtime story to Leo",
    tag: "Family",
    tagColor: "pink",
    minutes: 15,
    settled: false,
  },
];

const INITIAL_BUBBLES: readonly DemoBubble[] = [
  {
    id: "b0",
    role: "tibo",
    text: "Morning, Rhys. Three tasks on today's board and one walk left for your week.",
  },
  {
    id: "b1",
    role: "tibo",
    text: "Check anything off on the board, or ask me to change it.",
  },
];

const PROMPTS: readonly { readonly id: DemoActionId; readonly label: string }[] = [
  { id: "add-task", label: "Add 'Buy pancake mix' for Saturday" },
  { id: "focus", label: "Start a 25m focus session" },
  { id: "relay", label: "Ask @hannah about Thai for dinner" },
];

const VIEW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "tasks", label: "Tasks" },
  { value: "habits", label: "Habits" },
  { value: "goals", label: "Goals" },
] as const;

const MOBILE_LIVE_TABS: readonly { readonly value: MobileLiveTab; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "connections", label: "Connections" },
  { value: "mine", label: "Me" },
  { value: "path", label: "Path" },
];

const SIDEBAR_MAIN = [
  { label: "Now", icon: HouseIcon, active: true },
  { label: "Inbox", icon: MessageCircleIcon, active: false },
  { label: "Boards", icon: LibraryIcon, active: false },
] as const;

const SIDEBAR_BOARDS = [
  { label: "Tasks", icon: ListChecksIcon },
  { label: "Habits", icon: RepeatIcon },
  { label: "Goals", icon: TargetIcon },
  { label: "Notes", icon: NotebookPenIcon },
  { label: "Live", icon: RadioIcon },
  { label: "Diary", icon: BookOpenIcon },
] as const;

const SIDEBAR_EXTRA = [
  { label: "Discover", icon: SearchIcon },
  { label: "Leaderboard", icon: TrendingUpIcon },
] as const;

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function HeroWorkbench() {
  const [view, setView] = useState<ViewFilter>("all");
  const [mobileTab, setMobileTab] = useState<MobileTab>("day");
  const [mobileLiveTab, setMobileLiveTab] = useState<MobileLiveTab>("all");
  const [mobileNote, setMobileNote] = useState("");
  const [mobileNotePrivacy, setMobileNotePrivacy] = useState<Privacy>("connections");
  const [mobileNoteLive, setMobileNoteLive] = useState(true);
  const [mobileTiboOpen, setMobileTiboOpen] = useState(false);
  const [tasks, setTasks] = useState<readonly DemoTask[]>(INITIAL_TASKS);
  const [habitDone, setHabitDone] = useState(2);
  const [manualGoalAdds, setManualGoalAdds] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState<number | null>(null);
  const [sessionRunning, setSessionRunning] = useState(false);
  const [bubbles, setBubbles] = useState<readonly DemoBubble[]>(INITIAL_BUBBLES);
  const [usedPrompts, setUsedPrompts] = useState<ReadonlySet<DemoActionId>>(() => new Set());
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    if (!sessionRunning) return;
    const id = window.setInterval(() => {
      setSessionSeconds((current) => {
        if (current === null || current <= 1) {
          setSessionRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [sessionRunning]);

  const linkedSettled = tasks.filter((task) => task.linkedGoal && task.settled).length;
  const goalTotal = 10;
  const goalUnits = Math.min(goalTotal, 6 + linkedSettled + (habitDone >= 3 ? 1 : 0) + manualGoalAdds);
  const goalPercent = Math.round((goalUnits / goalTotal) * 100);
  const goalDone = goalUnits >= goalTotal;

  const toggleTask = (id: string) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, settled: !task.settled } : task)),
    );
  };

  const tapHabit = () => {
    setHabitDone((current) => (current >= 3 ? 0 : current + 1));
  };

  const runPrompt = (action: DemoActionId) => {
    if (usedPrompts.has(action)) return;
    setSpin((n) => n + 1);
    setUsedPrompts((current) => new Set(current).add(action));

    if (action === "add-task") {
      setView("all");
      setTasks((current) => [
        {
          id: "t-pancake",
          title: "Buy pancake mix for Saturday morning",
          tag: "Family",
          tagColor: "amber",
          deadline: "Sat",
          settled: false,
          importance: 4,
        },
        ...current,
      ]);
      setBubbles([
        {
          id: "u-add",
          role: "user",
          text: "Add 'Buy pancake mix' for Saturday morning",
          reaction: "🥞",
        },
        {
          id: "t-add-1",
          role: "tibo",
          text: "Added for Saturday. Leo is going to be very happy about this.",
          receipt: {
            kind: "task",
            verb: "Created",
            title: "Buy pancake mix for Saturday morning",
            tag: { name: "Family", color: "amber" },
            meta: "Sat",
          },
        },
      ]);
      return;
    }

    if (action === "focus") {
      setSessionSeconds(25 * 60);
      setSessionRunning(true);
      setBubbles([
        {
          id: "u-focus",
          role: "user",
          text: "Start a 25m focus session on webhook retries",
        },
        {
          id: "t-focus-1",
          role: "tibo",
          text: "Clock's running. Phones face down.",
          receipt: {
            kind: "session",
            verb: "Started",
            title: "Refactor webhook retries",
            meta: "25 min",
          },
        },
      ]);
      return;
    }

    setBubbles([
      {
        id: "u-relay",
        role: "user",
        text: "Ask @hannah if she wants Thai for dinner tonight",
      },
      {
        id: "t-relay-1",
        role: "tibo",
        text: "Okay, I'll ask Hannah for you.",
        relayNote: "Passed to @hannah's Tibo",
      },
      {
        id: "t-relay-2",
        role: "tibo",
        text: "Hannah says yes! Extra pad see ew and spring rolls for Leo.",
      },
    ]);
  };

  const reset = () => {
    setView("all");
    setMobileTab("day");
    setTasks(INITIAL_TASKS);
    setHabitDone(2);
    setManualGoalAdds(0);
    setSessionSeconds(null);
    setSessionRunning(false);
    setBubbles(INITIAL_BUBBLES);
    setUsedPrompts(new Set());
    setSpin((n) => n + 1);
  };

  const settledCount = 1 + tasks.filter((task) => task.settled).length + (habitDone >= 3 ? 1 : 0);
  const modified =
    usedPrompts.size > 0 ||
    habitDone !== 2 ||
    manualGoalAdds > 0 ||
    view !== "all" ||
    tasks.some((task) => INITIAL_TASKS.find((initial) => initial.id === task.id)?.settled !== task.settled);

  const showTasks = view === "all" || view === "tasks";
  const showHabits = view === "all" || view === "habits";
  const showGoals = view === "all" || view === "goals";

  const nowCard = (
    <Card className="flex min-h-0 flex-1 flex-col rounded-2xl [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b">
        <span aria-hidden="true" className="grid size-7 place-items-center justify-self-start text-muted-foreground">
          <ChevronUpIcon className="size-4" />
        </span>

        <div className="flex items-center gap-1">
          <span className="grid size-8 place-items-center rounded-full text-muted-foreground">
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
          </span>
          <span className="px-1 text-xl font-semibold tracking-tight">Today</span>
          <span className="grid size-8 place-items-center rounded-full text-muted-foreground">
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </span>
        </div>

        <span className="inline-flex items-center gap-1.5 justify-self-end px-1.5 text-xs font-medium text-muted-foreground">
          <CalendarRangeIcon aria-hidden="true" className="size-3.5" />
          <span className="max-sm:hidden">Upcoming</span>
        </span>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="-mt-1 flex shrink-0 items-center justify-between gap-2">
          <Segmented label="Show" value={view} options={VIEW_OPTIONS} onChange={setView} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-thin">
          {showTasks && (
            <ul aria-label="Tasks today" className="-mx-2 flex flex-col">
              {tasks.map((task) => (
                <li key={task.id}>
                  <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60">
                    <Checkbox
                      checked={task.settled}
                      onCheckedChange={() => toggleTask(task.id)}
                      aria-label={task.settled ? `Reopen "${task.title}"` : `Settle "${task.title}"`}
                      className="mt-0.5 size-4.5! rounded-full! border-muted-foreground/50! data-checked:border-success! data-checked:bg-success! data-checked:text-background! dark:data-checked:text-background!"
                    />
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none"
                    >
                      <span
                        className={cn(
                          "text-sm leading-5 wrap-break-word transition-colors duration-200",
                          task.settled && "text-muted-foreground line-through decoration-muted-foreground/60",
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                        {task.working && !task.settled && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
                            Working
                          </span>
                        )}
                        <TagChip name={task.tag} color={task.tagColor} />
                        {task.deadline && (
                          <span
                            className={cn(
                              "inline-flex h-5 items-center gap-1 rounded-full px-1.5 font-medium",
                              task.dueToday && !task.settled ? "bg-due text-due-foreground" : "bg-muted",
                            )}
                          >
                            <FlagIcon aria-hidden="true" className="size-3" />
                            {task.deadline}
                          </span>
                        )}
                        {task.importance !== undefined && (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-importance-soft pr-1.5 pl-1 font-semibold text-importance-ink tabular-nums">
                            <StarIcon aria-hidden="true" className="size-3 fill-importance text-importance" />
                            {task.importance}
                          </span>
                        )}
                        {task.minutes !== undefined && (
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon aria-hidden="true" className="size-3" />
                            {task.minutes}m
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showHabits && (
            <div data-tag="green" className="flex flex-col gap-1.5">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">Habits</span>
              <button
                type="button"
                onClick={tapHabit}
                aria-label={`Check in Evening walk with Hannah, ${habitDone} of 3 this week`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar py-2.5 pr-3 pl-2.5 text-left text-sidebar-foreground transition-[background-color,transform,border-color] outline-none hover:border-tag/40 hover:bg-sidebar-accent/50 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
                  habitDone >= 3 && "border-tag/50",
                )}
              >
                <HabitRing done={habitDone} target={3} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm leading-5 font-medium">Evening walk with Hannah</span>
                  <span className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                    <span>{habitDone} of 3 this week</span>
                    <span className="inline-flex items-center gap-1 font-medium text-tag-ink">
                      <FlameIcon aria-hidden="true" className="size-3" />
                      8 in a row
                    </span>
                  </span>
                </span>
                <MoreHorizontalIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}

          {showGoals && (
            <div data-tag="violet" className="flex flex-col gap-1.5">
              <span className="px-0.5 text-xs font-medium text-muted-foreground">Goals</span>
              <div className="flex flex-col">
                <div
                  className={cn(
                    "relative z-10 flex flex-col gap-2 rounded-xl border border-sidebar-border bg-sidebar px-3 py-2.5 text-sidebar-foreground transition-colors",
                    !goalDone && "rounded-br-none",
                    goalDone && "border-success/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 text-sm leading-5 font-medium">Ship v2 release</span>
                    <span className={cn("text-sm font-semibold tabular-nums", goalDone ? "text-success" : "text-tag-ink")}>
                      {goalPercent}%
                    </span>
                  </div>
                  <div className={cn("h-2 overflow-hidden rounded-full", goalDone ? "bg-success/15" : "bg-tag/15")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
                        goalDone ? "bg-success" : "bg-tag",
                      )}
                      style={{ width: `${Math.max(goalPercent, 2)}%` }}
                    />
                  </div>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {goalUnits} of {goalTotal}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClockIcon aria-hidden="true" className="size-3" />
                      Fri, Nov 27
                    </span>
                  </span>
                </div>
                {!goalDone && (
                  <button
                    type="button"
                    onClick={() => setManualGoalAdds((n) => n + 1)}
                    className="-mt-px inline-flex items-center gap-1 self-end rounded-b-lg border border-t-0 border-goal-move bg-goal-move px-2.5 pt-1 pb-1.5 text-xs font-medium text-goal-move-foreground transition-colors outline-none hover:bg-goal-move/85 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px [&_svg]:size-3.5"
                  >
                    <PlusIcon aria-hidden="true" />
                    Move Goal
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 font-medium text-foreground shadow-xs dark:bg-input">
              Settled
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums">
                {settledCount}
              </Badge>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 text-muted-foreground">
              Sessions
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums">
                {sessionSeconds !== null ? 1 : 0}
              </Badge>
            </span>
            <span className="hidden items-center gap-1 px-2 py-1 text-muted-foreground sm:inline-flex">
              Unscheduled
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums">
                2
              </Badge>
            </span>
          </div>
          <span className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-(--card-shadow) max-sm:size-9 max-sm:justify-center max-sm:px-0">
            <PlusIcon aria-hidden="true" className="size-3.5" />
            <span className="max-sm:hidden">New task</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );

  const tiboPanel = (onClose?: () => void) => (
    <section
      aria-label="Tibo chat preview"
      className="relative flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-(--card-shadow) md:min-h-0"
    >
      {onClose && (
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30" />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-22 bg-gradient-to-b from-popover via-popover/75 to-transparent"
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3.5">
        <div className="flex flex-col items-center">
          <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-lg">
            <TiboMark spin={spin} idle={false} className="size-10" />
          </div>
          <div className="-mt-2 flex flex-col items-center rounded-2xl border border-bubble-tibo-border bg-bubble-tibo px-3.5 py-0.5 text-bubble-tibo-foreground shadow-md">
            <span className="text-[0.9375rem] leading-snug font-semibold">Tibo</span>
          </div>
        </div>
        {onClose && (
          <div className="pointer-events-auto absolute top-3.5 right-3 rounded-full border border-bubble-tibo-border bg-bubble-tibo shadow-md">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Tibo" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col justify-end gap-3 px-4 pt-24 pb-3">
        {bubbles.map((bubble, index) => {
          const tibo = bubble.role === "tibo";
          const prevSame = bubbles[index - 1]?.role === bubble.role;
          const nextSame = bubbles[index + 1]?.role === bubble.role;
          const corners = cn(
            "rounded-2xl",
            tibo && prevSame && "rounded-tl-md",
            tibo && nextSame && "rounded-bl-md",
            !tibo && prevSame && "rounded-tr-md",
            !tibo && nextSame && "rounded-br-md",
          );

          return (
            <Message key={bubble.id} align={tibo ? "start" : "end"} className="items-end">
              {tibo && (
                <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
                  {!nextSame ? <TiboMark idle={false} className="size-7" /> : <span className="size-7" />}
                </MessageAvatar>
              )}
              <MessageContent className={cn("gap-1.5", tibo ? "pr-3" : "pl-8")}>
                <div className={cn("flex flex-col", tibo ? "items-start" : "items-end", bubble.reaction && "mb-3")}>
                  <Bubble align={tibo ? "start" : "end"} variant="outline" className="max-w-full">
                    <BubbleContent
                      className={cn(
                        "px-3.5 py-2 text-[0.8125rem] leading-relaxed",
                        tibo
                          ? "border-bubble-tibo-border! bg-bubble-tibo! text-bubble-tibo-foreground!"
                          : "relative border-transparent! bg-bubble-me! pr-9! text-bubble-me-foreground!",
                        corners,
                      )}
                    >
                      {bubble.text}
                      {!tibo && (
                        <span
                          aria-label="Seen"
                          className="pointer-events-none absolute right-2.5 bottom-1.5 inline-flex text-tick-seen"
                        >
                          <CheckCheckIcon className="size-3.5" />
                        </span>
                      )}
                    </BubbleContent>
                    {bubble.reaction && (
                      <BubbleReactions side="bottom" align="start" className="ring-popover">
                        {bubble.reaction}
                      </BubbleReactions>
                    )}
                  </Bubble>
                </div>

                {bubble.receipt && (
                  <div className="flex w-full items-start gap-2.5 rounded-xl border border-sidebar-border bg-sidebar py-2 pr-3 pl-2.5 text-left text-sidebar-foreground">
                    {bubble.receipt.kind === "task" ? (
                      <span
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 rounded-full border border-muted-foreground/50"
                      />
                    ) : (
                      <TimerIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-xs leading-snug font-medium">{bubble.receipt.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                        {bubble.receipt.tag && (
                          <TagChip
                            name={bubble.receipt.tag.name}
                            color={bubble.receipt.tag.color}
                            className="h-4.5 px-1.5 text-[0.6875rem]"
                          />
                        )}
                        <span>{bubble.receipt.meta}</span>
                      </span>
                    </span>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted-foreground">
                      <CheckIcon aria-hidden="true" className="size-3 text-primary" />
                      {bubble.receipt.verb}
                    </span>
                  </div>
                )}

                {bubble.relayNote && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.6875rem] font-medium text-muted-foreground">
                    <ArrowLeftRightIcon aria-hidden="true" className="size-3 text-primary" />
                    {bubble.relayNote}
                  </span>
                )}
              </MessageContent>
            </Message>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 px-3.5 pt-1 pb-3.5">
        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map(({ id, label }) => {
            const done = usedPrompts.has(id);
            return (
              <button
                key={id}
                type="button"
                disabled={done}
                onClick={() => runPrompt(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
                  done
                    ? "border-border/50 bg-muted/40 text-muted-foreground line-through opacity-55"
                    : "border-bubble-tibo-border bg-bubble-tibo text-bubble-tibo-foreground hover:border-primary/50 hover:bg-accent/70",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <InputGroup className="rounded-2xl! border-composer-border! bg-composer!">
          <InputGroupAddon align="inline-start" className="pl-1.5">
            <span className="grid size-7 place-items-center rounded-full text-muted-foreground">
              <PlusIcon aria-hidden="true" className="size-4.5" />
            </span>
          </InputGroupAddon>
          <InputGroupInput
            readOnly
            value=""
            placeholder="Message Tibo…"
            aria-label="Message Tibo preview"
            className="h-10 text-sm"
          />
          <InputGroupAddon align="inline-end" className="pr-1.5">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              aria-hidden="true"
              className="rounded-full text-muted-foreground opacity-60"
            >
              <SendIcon className="size-4.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </section>
  );

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-2 top-8 -bottom-4 -z-10 rounded-[2.25rem] bg-(image:--card-glow) opacity-85 blur-2xl dark:opacity-60"
      />

      {/* Desktop App Shell (md and up) */}
      <div
        className="hidden overflow-hidden rounded-[1.5rem] border border-border/90 shadow-2xl ring-1 ring-foreground/5 md:flex md:min-h-[39rem] lg:min-h-[43rem]"
        style={{ backgroundImage: "var(--page-gradient)" }}
      >
        <aside
          aria-hidden="true"
          className="flex w-14 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar py-3 text-sidebar-foreground xl:w-48 xl:px-2.5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 px-1.5 py-1 xl:justify-start">
              <AppLogo className="size-6" />
              <span className="hidden text-[1.0625rem] font-semibold tracking-[-0.03em] xl:inline">Dueboard</span>
            </div>

            <div className="flex flex-col gap-1">
              {SIDEBAR_MAIN.map(({ label, icon: Icon, active }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "flex h-8 items-center justify-center gap-2.5 rounded-lg px-2 text-sm text-sidebar-foreground/80 xl:justify-start",
                      active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-[1.0625rem] shrink-0" />
                    <span className="hidden truncate xl:inline">{label}</span>
                  </span>

                  {label === "Boards" && (
                    <div className="mt-0.5 ml-4 hidden flex-col gap-0.5 border-l border-sidebar-border pl-2.5 xl:flex">
                      {SIDEBAR_BOARDS.map(({ label: sub, icon: SubIcon }) => (
                        <span
                          key={sub}
                          className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-sidebar-foreground/75"
                        >
                          <SubIcon className="size-3.5 shrink-0" />
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {SIDEBAR_EXTRA.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex h-8 items-center justify-center gap-2.5 rounded-lg px-2 text-sm text-sidebar-foreground/80 xl:justify-start"
                >
                  <Icon className="size-[1.0625rem] shrink-0" />
                  <span className="hidden truncate xl:inline">{label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex h-8 items-center justify-center gap-2.5 rounded-lg px-2 text-sm text-sidebar-foreground/80 xl:justify-start">
              <SettingsIcon className="size-[1.0625rem] shrink-0" />
              <span className="hidden truncate xl:inline">Settings</span>
            </span>
            <div className="flex items-center justify-center gap-2.5 rounded-lg px-1.5 py-1.5 xl:justify-start">
              <span
                data-tag="teal"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-tag text-xs font-semibold text-background"
              >
                RS
              </span>
              <div className="hidden min-w-0 flex-1 flex-col leading-tight xl:flex">
                <span className="truncate text-xs font-medium">Rhys Sullivan</span>
                <span className="truncate text-[0.6875rem] text-muted-foreground">@rhys</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid h-13 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3.5">
            <div className="flex min-w-0 items-center">
              {sessionSeconds !== null ? (
                <button
                  type="button"
                  onClick={() => setSessionRunning((running) => !running)}
                  title={sessionRunning ? "Pause session" : "Resume session"}
                  className="inline-flex h-8 items-center gap-2 rounded-full bg-session-pill px-3 text-sm font-medium text-session-pill-foreground tabular-nums ring-1 ring-session-pill-foreground/15 transition-colors hover:bg-session-pill/80"
                >
                  {sessionRunning ? (
                    <span aria-hidden="true" className="size-2 animate-focus-breathe rounded-full bg-session-pill-dot" />
                  ) : (
                    <PauseIcon aria-hidden="true" className="size-3.5" />
                  )}
                  {formatClock(sessionSeconds)}
                  <span className="font-normal opacity-80">Webhook retries</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => runPrompt("focus")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-cream px-3 text-sm font-medium text-cream-foreground ring-1 ring-cream-foreground/10 transition-colors hover:bg-cream/80 dark:ring-0"
                >
                  <TimerIcon aria-hidden="true" className="size-3.5" />
                  Start a session
                </button>
              )}
            </div>

            <div className="flex flex-col items-center text-center leading-tight">
              <span className="text-sm font-semibold">Sat, Nov 21</span>
              <span className="text-xs text-muted-foreground tabular-nums">11:24 AM</span>
            </div>

            <div className="flex items-center justify-end gap-2">
              {modified && (
                <Button variant="ghost" size="xs" className="rounded-full text-muted-foreground" onClick={reset}>
                  <RotateCcwIcon />
                  Reset
                </Button>
              )}
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full text-muted-foreground">
                <BellIcon className="size-4" />
              </span>
              <span
                aria-hidden="true"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tibo pr-3 pl-1.5 text-sm font-medium text-tibo-foreground shadow-sm"
              >
                <TiboMark spin={spin} idle={false} className="size-6" />
                Tibo
              </span>
            </div>
          </div>

          <div className="grid flex-1 items-stretch gap-3 px-3 pb-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
            {nowCard}
            {tiboPanel()}
          </div>
        </div>
      </div>

      {/* Authentic Mobile UI (< md) — locked fixed height across All / Tasks / Habits / Goals / Live */}
      <div
        className="relative mx-auto flex max-w-md flex-col overflow-hidden rounded-[2rem] border border-border/90 shadow-2xl ring-1 ring-foreground/5 md:hidden"
        style={{ backgroundImage: "var(--page-gradient)" }}
      >
        <div className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-chrome/70 px-3 backdrop-blur-md">
          <div className="flex min-w-0 items-center">
            {sessionSeconds !== null ? (
              <button
                type="button"
                onClick={() => setSessionRunning((running) => !running)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-session-pill px-2.5 text-xs font-medium text-session-pill-foreground tabular-nums ring-1 ring-session-pill-foreground/15"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full bg-session-pill-dot",
                    sessionRunning && "animate-focus-breathe",
                  )}
                />
                {formatClock(sessionSeconds)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runPrompt("focus")}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-cream px-2.5 text-xs font-medium text-cream-foreground ring-1 ring-cream-foreground/10 dark:ring-0"
              >
                <TimerIcon aria-hidden="true" className="size-3.5" />
                Start
              </button>
            )}
          </div>

          <div className="flex flex-col items-center text-center leading-tight">
            <span className="text-xs font-semibold">Sat, Nov 21</span>
            <span className="text-[0.6875rem] text-muted-foreground tabular-nums">11:24 AM</span>
          </div>

          <div className="flex items-center justify-end gap-1">
            {modified && (
              <Button variant="ghost" size="icon-xs" aria-label="Reset preview" onClick={reset}>
                <RotateCcwIcon />
              </Button>
            )}
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-full text-muted-foreground">
              <BellIcon className="size-4" />
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-2 pt-2 pb-28">
          <div role="tablist" aria-label="Now view" className="grid w-full grid-cols-2 rounded-lg bg-muted p-0.5 text-xs">
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "day"}
              onClick={() => setMobileTab("day")}
              className={cn(
                "h-8 rounded-md font-medium transition-colors",
                mobileTab === "day" ? "bg-background text-foreground shadow-xs dark:bg-input" : "text-muted-foreground",
              )}
            >
              Tasks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "live"}
              onClick={() => setMobileTab("live")}
              className={cn(
                "h-8 rounded-md font-medium transition-colors",
                mobileTab === "live" ? "bg-background text-foreground shadow-xs dark:bg-input" : "text-muted-foreground",
              )}
            >
              Live
            </button>
          </div>

          <div className="flex h-[43rem] flex-col">
            {mobileTab === "day" ? (
              nowCard
            ) : (
              <Card className="flex min-h-0 flex-1 flex-col gap-2.5! rounded-2xl pt-2.5! [--card-spacing:--spacing(4)]">
                <CardHeader className="flex shrink-0 flex-col items-stretch! gap-2 border-b pb-2.5!">
                  <div className="flex justify-center">
                    <Segmented
                      label="Show on Live"
                      value={mobileLiveTab}
                      options={MOBILE_LIVE_TABS}
                      onChange={setMobileLiveTab}
                    />
                  </div>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-3">
                  {mobileLiveTab === "path" ? (
                    <ol data-tag="teal" className="flex flex-1 flex-col justify-end py-2">
                      {[
                        { time: "8:15 AM", action: "checked a habit", title: "Evening walk with Hannah" },
                        { time: "10:10 AM", action: "finished 25m of focus", title: "Refactor webhook retries" },
                        { time: "11:22 AM", action: "settled a task", title: "Fix OAuth redirect bug" },
                      ].map((step) => (
                        <li key={step.time} className="group grid grid-cols-[4rem_0.75rem_1fr] gap-x-2">
                          <time className="pt-1 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
                            {step.time}
                          </time>
                          <span className="relative before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-tag/40 group-first:before:top-2 group-last:before:bottom-auto group-last:before:h-2">
                            <span className="absolute top-2 left-1/2 size-2 -translate-1/2 rounded-full bg-tag ring-2 ring-card" />
                          </span>
                          <p className="py-0.5 pb-2.5 text-xs text-muted-foreground">
                            {step.action}: <span className="text-foreground">{step.title}</span>
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="flex flex-1 flex-col justify-end gap-1.5 text-[0.8125rem]">
                      <div className="flex items-center justify-center pb-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <CheckIcon aria-hidden="true" className="size-3.5" />
                          You are all caught up
                        </span>
                      </div>
                      <p className="py-1 text-center text-xs font-medium text-muted-foreground">Today</p>
                      {mobileLiveTab !== "mine" && (
                        <div className="flex items-baseline justify-between gap-2 py-1">
                          <p className="text-muted-foreground">
                            <span data-tag="indigo" className="font-semibold text-tag-ink">samdev</span> finished 45m of focus:{" "}
                            <span className="text-foreground">Postgres query tuning</span>
                          </p>
                          <span className="text-xs text-muted-foreground tabular-nums">1h</span>
                        </div>
                      )}
                      {mobileLiveTab !== "mine" && (
                        <div className="flex items-baseline justify-between gap-2 py-1">
                          <p className="text-muted-foreground">
                            <span data-tag="orange" className="font-semibold text-tag-ink">hannah</span> completed a habit:{" "}
                            <span className="text-foreground">Morning yoga</span>
                          </p>
                          <span className="text-xs text-muted-foreground tabular-nums">18m</span>
                        </div>
                      )}
                      {mobileLiveTab !== "mine" && (
                        <div className="flex items-baseline justify-between gap-2 py-1">
                          <p className="text-muted-foreground">
                            <span data-tag="violet" className="font-semibold text-tag-ink">maya</span> moved a goal:{" "}
                            <span className="text-foreground">Bake 12 sourdough loaves (75%)</span>
                          </p>
                          <span className="text-xs text-muted-foreground tabular-nums">6m</span>
                        </div>
                      )}
                      {mobileLiveTab !== "connections" && (
                        <div className="flex items-baseline justify-between gap-2 py-1">
                          <p className="text-muted-foreground">
                            <span data-tag="teal" className="font-semibold text-tag-ink">rhys</span> settled a task:{" "}
                            <span className="text-foreground">Pick up cupcakes for Maya</span>
                          </p>
                          <span className="text-xs text-muted-foreground tabular-nums">now</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex shrink-0 flex-col gap-1.5 border-t pt-3">
                    <InputGroup className="rounded-full bg-background/60">
                      <InputGroupInput
                        value={mobileNote}
                        onChange={(event) => setMobileNote(event.target.value)}
                        maxLength={NOTE_BODY_MAX_LENGTH}
                        placeholder="Post a note…"
                        aria-label="Post a note"
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>
                          <NoteCountdown length={mobileNote.length} className="text-xs" />
                        </InputGroupText>
                        <InputGroupButton
                          type="button"
                          variant="default"
                          size="icon-xs"
                          className="rounded-full"
                          disabled={!mobileNote.trim()}
                          onClick={() => setMobileNote("")}
                        >
                          <ArrowUpIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <div className="flex items-center gap-0.5 pr-12 pl-1">
                      <PrivacyPill value={mobileNotePrivacy} onChange={setMobileNotePrivacy} />
                      <LiveToggle value={mobileNoteLive} onChange={setMobileNoteLive} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Floating TiboFab */}
        {!mobileTiboOpen && (
          <button
            type="button"
            aria-label="Open Tibo"
            onClick={() => {
              setSpin((n) => n + 1);
              setMobileTiboOpen(true);
            }}
            className="absolute right-3.5 bottom-24 z-20 grid size-12 place-items-center rounded-full shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-ring/60"
          >
            <TiboMark spin={spin} className="size-12" />
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-tibo-unread ring-2 ring-background"
            />
          </button>
        )}

        {/* Mobile Bottom Dock (MobileNav) */}
        <nav aria-label="Mobile navigation preview" className="absolute inset-x-3 bottom-3 z-20">
          <div className="flex flex-col items-center rounded-[1.75rem] border border-sidebar-border bg-sidebar px-2 pb-2 text-sidebar-foreground shadow-lg">
            <button
              type="button"
              onClick={() => {
                setSpin((n) => n + 1);
                setMobileTiboOpen(true);
              }}
              aria-label="Open Tibo"
              className="flex h-4 w-20 items-center justify-center rounded-full outline-none"
            >
              <span className="h-1 w-9 rounded-full bg-muted-foreground/30" />
            </button>
            <ul className="grid w-full grid-cols-4 gap-1">
              {[
                { label: "Now", icon: HouseIcon, active: true },
                { label: "Inbox", icon: MessageCircleIcon, active: false },
                { label: "Boards", icon: LibraryIcon, active: false },
              ].map(({ label, icon: Icon, active }) => (
                <li key={label}>
                  <span
                    className={cn(
                      "flex h-13 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium text-sidebar-foreground/70",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4.5" />
                    {label}
                  </span>
                </li>
              ))}
              <li>
                <span className="flex h-13 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-medium text-sidebar-foreground/70">
                  <span
                    data-tag="teal"
                    className="grid size-5 place-items-center rounded-full bg-tag text-[0.625rem] font-semibold text-background"
                  >
                    R
                  </span>
                  Profile
                </span>
              </li>
            </ul>
          </div>
        </nav>

        {/* Mobile Tibo Bottom Sheet Overlay */}
        {mobileTiboOpen && (
          <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/35 p-2 backdrop-blur-[2px]">
            {tiboPanel(() => setMobileTiboOpen(false))}
          </div>
        )}
      </div>
    </div>
  );
}
