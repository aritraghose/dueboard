import type { Privacy, TagColor } from "@dueboard/api/rpc";
import {
  ArrowLeftRightIcon,
  ArrowUpIcon,
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
  ListChecksIcon,
  LockIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RadioIcon,
  RepeatIcon,
  SendIcon,
  ShieldCheckIcon,
  SquareIcon,
  StarIcon,
  TargetIcon,
  TimerIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { HabitRing } from "@/components/habit-ring";
import { NoteCountdown, NoteRing } from "@/components/note-composer";
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

type FeatureId = "plan" | "live" | "tibo" | "relays" | "ask" | "notes-sessions" | "diary" | "profile";

type FeatureItem = {
  readonly id: FeatureId;
  readonly title: string;
  readonly summary: string;
  readonly icon?: LucideIcon;
  readonly tiboLogo?: boolean;
};

const FEATURES: readonly FeatureItem[] = [
  {
    id: "plan",
    title: "Tasks, habits & goals",
    summary: "Settle your tasks, check off habits or move your goals forward. Everything flexible and interconnected.",
    icon: ListChecksIcon,
  },
  {
    id: "live",
    title: "Connections & Live",
    summary: "Broadcast what you are getting done and see what your friends are checking off, in real time.",
    icon: RadioIcon,
  },
  {
    id: "tibo",
    title: "Tibo on your board",
    summary: "Ask Tibo to settle a task, move a goal or literally anything on your behalf across the app.",
    tiboLogo: true,
  },
  {
    id: "relays",
    title: "Relays",
    summary: "Pass messages to your friends by just asking Tibo and let him become the middleman.",
    icon: ArrowLeftRightIcon,
  },
  {
    id: "ask",
    title: "Ask page",
    summary: "Let Tibo become your spokesperson. Tibo will only reply based on the context you set.",
    icon: MessageCircleQuestionIcon,
  },
  {
    id: "notes-sessions",
    title: "Notes and Sessions",
    summary:
      "Share quick notes about what you are doing, how your day is going, or just random stuff. Or, start a Focus Session.",
    icon: TimerIcon,
  },
  {
    id: "diary",
    title: "Diary",
    summary:
      "Every settled task, checked off habit, moved goal, completed focus session, and note forms your day. Your days form your diary.",
    icon: BookOpenIcon,
  },
  {
    id: "profile",
    title: "Profile & graph",
    summary: "Your profile, everything summed up at one place.",
    icon: UserRoundIcon,
  },
];

const STORY_MS = 6000;

function FeatureIcon({
  feature,
  active,
  onPrimary = false,
  size = "md",
}: {
  feature: FeatureItem;
  active: boolean;
  /** The icon sits on a filled primary surface, such as the selected pill. */
  onPrimary?: boolean;
  size?: "sm" | "md";
}) {
  if (feature.tiboLogo) {
    return <TiboMark idle={false} className={size === "sm" ? "size-4 shrink-0" : "size-5 shrink-0"} />;
  }
  const Icon = feature.icon!;
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        size === "sm" ? "size-3.5 shrink-0" : "size-4 shrink-0",
        "transition-colors",
        onPrimary
          ? "text-primary-foreground"
          : active
            ? "text-primary"
            : "text-muted-foreground group-hover:text-foreground",
      )}
    />
  );
}

export function FeatureShowcase() {
  const reduced = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const [stageHover, setStageHover] = useState(false);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const active = FEATURES[activeIndex]!;
  const paused = Boolean(reduced) || manualPaused || stageHover || !inView;
  // The story timer is the CSS animation on the active progress bar: nothing re-renders while it runs.
  const progressStyle = { animationDuration: `${STORY_MS}ms`, animationPlayState: paused ? "paused" : "running" };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Panels differ in height. Keep the tallest one seen at this width so the page below stops jumping.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let width = stage.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (stage.offsetWidth !== width) {
        width = stage.offsetWidth;
        stage.style.minHeight = "";
        return;
      }
      const height = stage.offsetHeight;
      if (height > (Number.parseFloat(stage.style.minHeight) || 0)) stage.style.minHeight = `${height}px`;
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = pillsRef.current;
    const pill = scroller?.children[activeIndex] as HTMLElement | undefined;
    if (!scroller || !pill) return;
    const targetLeft = pill.offsetLeft - (scroller.clientWidth - pill.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: reduced ? "auto" : "smooth" });
  }, [activeIndex, reduced]);

  const selectIndex = (index: number) => {
    setRun((value) => value + 1);
    setActiveIndex(index);
  };

  const step = (delta: number) => {
    setRun((value) => value + 1);
    setActiveIndex((index) => (index + delta + FEATURES.length) % FEATURES.length);
  };

  return (
    <section ref={sectionRef} id="features" aria-labelledby="features-heading" className="scroll-mt-24 py-16 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 id="features-heading" className="text-section font-[630] text-balance">
          Everything inside Dueboard.
        </h2>

        {!reduced && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full bg-card/80 text-muted-foreground hover:text-foreground"
            aria-label={manualPaused ? "Play feature stories" : "Pause feature stories"}
            onClick={() => setManualPaused((value) => !value)}
          >
            {manualPaused ? <PlayIcon /> : <PauseIcon />}
            <span>{manualPaused ? "Play" : "Pause"}</span>
          </Button>
        )}
      </div>

      {/* Instagram-Story-style 8-segment progress bar */}
      <div role="group" aria-label="Feature progress" className="mt-6 grid grid-cols-8 gap-1.5 sm:gap-2">
        {FEATURES.map((feature, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={feature.id}
              type="button"
              aria-label={`Show ${feature.title}`}
              aria-current={index === activeIndex ? "step" : undefined}
              onClick={() => selectIndex(index)}
              className="group py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-foreground/12 transition-colors group-hover:bg-foreground/22">
                {isActive && !reduced ? (
                  <span
                    key={run}
                    className="block h-full w-full origin-left animate-story-progress rounded-full bg-primary"
                    style={progressStyle}
                    onAnimationEnd={() => setActiveIndex((current) => (current + 1) % FEATURES.length)}
                  />
                ) : (
                  <span
                    className={cn(
                      "block h-full w-full origin-left rounded-full bg-primary",
                      index > activeIndex && "scale-x-0",
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile horizontal pill bar & active story card (< lg) */}
      <div className="mt-2 flex flex-col gap-3 lg:hidden">
        <div ref={pillsRef} className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {FEATURES.map((feature, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => selectIndex(index)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary text-primary-foreground shadow-xs"
                    : "border-border/80 bg-card/80 text-muted-foreground hover:text-foreground",
                )}
              >
                {feature.tiboLogo ? (
                  <TiboMark idle={false} className="size-4 shrink-0" />
                ) : (
                  <FeatureIcon feature={feature} active={false} onPrimary={isActive} size="sm" />
                )}
                {feature.title}
              </button>
            );
          })}
        </div>

        <div className="flex items-start justify-between gap-3 rounded-2xl border bg-card/85 px-4 py-3 shadow-xs">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
              <FeatureIcon feature={active} active size="sm" />
              {active.title}
            </span>
            <p className="min-h-[4lh] text-xs leading-relaxed sm:min-h-[2lh] text-pretty text-muted-foreground">
              {active.summary}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full bg-background/80"
              aria-label="Previous feature"
              onClick={() => step(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full bg-background/80"
              aria-label="Next feature"
              onClick={() => step(1)}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop vertical tabs + large stage (lg+) */}
      <div className="mt-4 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div
          role="tablist"
          aria-label="Dueboard features"
          aria-orientation="vertical"
          className="hidden flex-col gap-1.5 lg:flex"
        >
          {FEATURES.map((feature, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={feature.id}
                type="button"
                role="tab"
                id={`feature-tab-${feature.id}`}
                aria-selected={isActive}
                aria-controls={`feature-panel-${feature.id}`}
                onClick={() => selectIndex(index)}
                className={cn(
                  "group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-2xl px-4 py-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-card text-foreground shadow-(--card-shadow) ring-1 ring-foreground/10"
                    : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-xl transition-colors",
                      feature.tiboLogo
                        ? "bg-transparent"
                        : isActive
                          ? "bg-primary/12 text-primary"
                          : "bg-muted/70 text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <FeatureIcon feature={feature} active={isActive} />
                  </span>
                  <span className="text-[0.9375rem] font-semibold tracking-tight">{feature.title}</span>
                </span>

                {isActive && (
                  <span className="pl-11 text-sm leading-snug text-pretty text-muted-foreground">
                    {feature.summary}
                  </span>
                )}

                {isActive && (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-foreground/8">
                    <span
                      key={run}
                      className={cn("block h-full w-full origin-left bg-primary", !reduced && "animate-story-progress")}
                      style={reduced ? undefined : progressStyle}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          ref={stageRef}
          id={`feature-panel-${active.id}`}
          role="tabpanel"
          aria-labelledby={`feature-tab-${active.id}`}
          onPointerEnter={() => setStageHover(true)}
          onPointerLeave={() => setStageHover(false)}
          onFocusCapture={() => setStageHover(true)}
          onBlurCapture={() => setStageHover(false)}
          className="relative flex min-h-[30rem] min-w-0 flex-col lg:min-h-[36rem]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex min-w-0 flex-1 flex-col"
            >
              {active.id === "plan" && <TasksHabitsGoalsPanel />}
              {active.id === "live" && <ConnectionsLivePanel />}
              {active.id === "tibo" && <TiboActionsPanel />}
              {active.id === "relays" && <RelaysPanel />}
              {active.id === "ask" && <AskPagePanel />}
              {active.id === "notes-sessions" && <NotesSessionsPanel />}
              {active.id === "diary" && <DiaryPanel />}
              {active.id === "profile" && <ProfileGraphPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* 1. Tasks, habits & goals */
function TasksHabitsGoalsPanel() {
  const [tasks, setTasks] = useState<
    readonly {
      id: string;
      title: string;
      tag: string;
      color: TagColor;
      deadline?: string;
      dueToday?: boolean;
      working?: boolean;
      stars?: number;
      minutes?: number;
      settled: boolean;
    }[]
  >([
    {
      id: "1",
      title: "Fix OAuth redirect bug before standup",
      tag: "Work",
      color: "teal",
      deadline: "Today",
      dueToday: true,
      working: true,
      stars: 4,
      minutes: 30,
      settled: false,
    },
    {
      id: "2",
      title: "Pick up cupcakes for Maya's birthday",
      tag: "Family",
      color: "amber",
      deadline: "Today",
      dueToday: true,
      stars: 5,
      minutes: 20,
      settled: false,
    },
  ]);
  const [habitDone, setHabitDone] = useState(2);
  const [goalCount, setGoalCount] = useState(14);
  const goalTarget = 20;
  const percent = Math.min(100, Math.round((goalCount / goalTarget) * 100));
  const goalDone = goalCount >= goalTarget;

  const toggle = (id: string) =>
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, settled: !task.settled } : task)));

  const settledCount = 1 + tasks.filter((task) => task.settled).length + (habitDone >= 3 ? 1 : 0);

  return (
    <Card className="flex flex-1 flex-col rounded-2xl [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="grid grid-cols-[1fr_auto_1fr] items-center border-b">
        <span className="grid size-7 place-items-center justify-self-start text-muted-foreground">
          <ChevronUpIcon aria-hidden="true" className="size-4" />
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
        <span className="inline-flex items-center gap-1.5 justify-self-end px-2 py-1 text-xs font-medium text-muted-foreground">
          <CalendarRangeIcon aria-hidden="true" className="size-3.5" />
          <span className="max-sm:hidden">Upcoming</span>
        </span>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <div className="flex flex-col gap-5">
          <ul aria-label="Sample tasks" className="-mx-2 flex flex-col">
            {tasks.map((task) => (
              <li key={task.id}>
                <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60">
                  <Checkbox
                    checked={task.settled}
                    onCheckedChange={() => toggle(task.id)}
                    aria-label={task.settled ? `Reopen "${task.title}"` : `Settle "${task.title}"`}
                    className="mt-0.5 size-4.5! rounded-full! border-muted-foreground/50! data-checked:border-success! data-checked:bg-success! data-checked:text-background! dark:data-checked:text-background!"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(task.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none"
                  >
                    <span
                      className={cn(
                        "text-sm leading-5 transition-colors",
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
                      <TagChip name={task.tag} color={task.color} />
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
                      {task.stars !== undefined && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-importance-soft pr-1.5 pl-1 font-semibold text-importance-ink tabular-nums">
                          <StarIcon aria-hidden="true" className="size-3 fill-importance text-importance" />
                          {task.stars}
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

          <div className="grid gap-4 md:grid-cols-2">
            <div data-tag="teal" className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Habits</span>
              <button
                type="button"
                onClick={() => setHabitDone((n) => (n >= 3 ? 0 : n + 1))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar py-2.5 pr-3 pl-2.5 text-left text-sidebar-foreground transition-[background-color,transform,border-color] outline-none hover:border-tag/40 hover:bg-sidebar-accent/50 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
                  habitDone >= 3 && "border-tag/50",
                )}
              >
                <HabitRing done={habitDone} target={3} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm leading-5 font-medium">Evening walk with Hannah</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{habitDone} of 3 this week</span>
                    <span className="inline-flex items-center gap-1 font-medium text-tag-ink">
                      <FlameIcon aria-hidden="true" className="size-3" />8 in a row
                    </span>
                  </span>
                </span>
                <MoreHorizontalIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </button>
            </div>

            <div data-tag="violet" className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Goals</span>
              <div className="flex flex-col">
                <div
                  className={cn(
                    "relative z-10 flex flex-col gap-2 rounded-xl border border-sidebar-border bg-sidebar px-3 py-2.5 text-sidebar-foreground transition-colors",
                    !goalDone && "rounded-br-none",
                    goalDone && "border-success/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 pt-0.5 text-sm leading-5 font-medium">Ship v2 release</span>
                    <span
                      className={cn(
                        "pt-0.5 text-sm font-semibold tabular-nums",
                        goalDone ? "text-success" : "text-tag-ink",
                      )}
                    >
                      {percent}%
                    </span>
                  </div>
                  <div className={cn("h-2 overflow-hidden rounded-full", goalDone ? "bg-success/15" : "bg-tag/15")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
                        goalDone ? "bg-success" : "bg-tag",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {goalCount} of {goalTarget}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClockIcon aria-hidden="true" className="size-3" />
                      In 12 days
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalCount((n) => (n >= goalTarget ? 14 : n + 1))}
                  className="-mt-px inline-flex items-center gap-1 self-end rounded-b-lg border border-t-0 border-goal-move bg-goal-move px-2.5 pt-1 pb-1.5 text-xs font-medium text-goal-move-foreground transition-colors outline-none hover:bg-goal-move/85 focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px [&_svg]:size-3.5"
                >
                  <PlusIcon aria-hidden="true" />
                  {goalDone ? "Reset" : "Move Goal"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
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
                1
              </Badge>
            </span>
            <span className="hidden items-center gap-1 px-2 py-1 text-muted-foreground sm:inline-flex">
              Unscheduled
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums">
                2
              </Badge>
            </span>
          </div>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-(--card-shadow)">
            <PlusIcon aria-hidden="true" className="size-3.5" />
            New task
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* 2. Connections & Live */
const LIVE_TABS = [
  { value: "all", label: "All" },
  { value: "connections", label: "Connections" },
  { value: "mine", label: "Me" },
  { value: "path", label: "Path" },
] as const;

function ConnectionsLivePanel() {
  const [liveTab, setLiveTab] = useState<(typeof LIVE_TABS)[number]["value"]>("all");
  const [privacy, setPrivacy] = useState<"connections" | "private">("connections");
  const [note, setNote] = useState("");
  const [notePrivacy, setNotePrivacy] = useState<Privacy>("connections");
  const [noteLive, setNoteLive] = useState(true);

  return (
    <Card className="flex flex-1 flex-col gap-2.5! rounded-2xl pt-3! [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]">
      <CardHeader className="flex flex-col items-stretch! gap-2.5 border-b pb-3!">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <span />
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            Live
          </span>
          <button
            type="button"
            onClick={() => setPrivacy((p) => (p === "connections" ? "private" : "connections"))}
            className="inline-flex h-7 items-center gap-1.5 justify-self-end rounded-full bg-muted px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {privacy === "connections" ? <UsersIcon className="size-3.5" /> : <LockIcon className="size-3.5" />}
            {privacy === "connections" ? "Connections" : "Only me"}
          </button>
        </div>
        <div className="flex justify-center">
          <Segmented label="Show on Live" value={liveTab} options={LIVE_TABS} onChange={setLiveTab} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        {liveTab === "path" ? (
          <ol data-tag="teal" className="flex flex-1 flex-col justify-end py-2">
            {[
              { time: "8:15 AM", action: "checked a habit", title: "Evening walk with Hannah" },
              { time: "10:10 AM", action: "finished 25m of focus", title: "Refactor webhook retries" },
              { time: "11:22 AM", action: "settled a task", title: "Order Leo's surprise Lego set" },
              { time: "1:05 PM", action: "moved a goal", title: "Ship v2 release (70%)" },
            ].map((step) => (
              <li key={step.time} className="group grid grid-cols-[4.5rem_0.75rem_1fr] gap-x-2.5">
                <time className="pt-1.5 text-right text-xs text-muted-foreground tabular-nums">{step.time}</time>
                <span className="relative before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-tag/40 group-first:before:top-2.5 group-last:before:bottom-auto group-last:before:h-2.5">
                  <span className="absolute top-2.5 left-1/2 size-2 -translate-1/2 rounded-full bg-tag ring-2 ring-card" />
                </span>
                <p className="py-1 pb-2.5 text-sm text-muted-foreground">
                  {step.action}: <span className="text-foreground">{step.title}</span>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-1 flex-col justify-end py-1">
            <div className="flex min-h-6 items-center justify-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon aria-hidden="true" className="size-3.5" />
                You are all caught up
              </span>
            </div>
            <p className="py-2 text-center text-xs font-medium text-muted-foreground">Today</p>
            <ol className="flex flex-col gap-1 pb-1 text-sm">
              {liveTab !== "mine" && (
                <li className="flex items-baseline gap-2.5 py-1.5">
                  <p className="min-w-0 flex-1 text-muted-foreground">
                    <span data-tag="indigo" className="font-semibold text-tag-ink">
                      samdev
                    </span>{" "}
                    finished 45m of focus: <span className="text-foreground">Postgres query tuning</span>
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">1h</span>
                </li>
              )}
              {liveTab !== "mine" && (
                <li className="flex items-baseline gap-2.5 py-1.5">
                  <p className="min-w-0 flex-1 text-muted-foreground">
                    <span data-tag="orange" className="font-semibold text-tag-ink">
                      hannah
                    </span>{" "}
                    completed a habit: <span className="text-foreground">Morning yoga</span>
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">18m</span>
                </li>
              )}
              {liveTab !== "mine" && (
                <li className="flex items-baseline gap-2.5 py-1.5">
                  <p className="min-w-0 flex-1 text-muted-foreground">
                    <span data-tag="violet" className="font-semibold text-tag-ink">
                      maya
                    </span>{" "}
                    moved a goal: <span className="text-foreground">Bake 12 sourdough loaves (75%)</span>
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">6m</span>
                </li>
              )}
              {liveTab !== "connections" && (
                <li className="-mx-2 flex items-baseline gap-2.5 rounded-lg bg-secondary/45 px-2 py-1.5 transition-colors">
                  <p className="min-w-0 flex-1 text-muted-foreground">
                    <span data-tag="teal" className="font-semibold text-tag-ink">
                      rhys
                    </span>{" "}
                    settled a task
                    {privacy === "connections" && (
                      <>
                        : <span className="text-foreground">Order Leo's surprise Lego set</span>
                      </>
                    )}
                  </p>
                  <span className="text-xs text-muted-foreground tabular-nums">now</span>
                </li>
              )}
            </ol>
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t pt-3">
          <InputGroup className="rounded-full bg-background/60">
            <InputGroupInput
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_BODY_MAX_LENGTH}
              placeholder="Post a note…"
              aria-label="Post a note"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>
                <NoteCountdown length={note.length} className="text-sm" />
              </InputGroupText>
              <InputGroupButton
                type="button"
                variant="default"
                size="icon-xs"
                className="rounded-full"
                disabled={!note.trim()}
                onClick={() => setNote("")}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <div className="flex items-center gap-0.5 px-1">
            <PrivacyPill value={notePrivacy} onChange={setNotePrivacy} />
            <LiveToggle value={noteLive} onChange={setNoteLive} />
            <span className="ml-auto px-1 text-xs text-muted-foreground tabular-nums">2 notes today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* 3. Tibo creating / moving / settling tasks & goals */
const TIBO_SCENARIOS = [
  {
    id: "create",
    label: "Start a task",
    user: "Add 'Write tests for sync worker' for Friday and mark it working",
    reaction: "⚡",
    reply: "Added and marked working. Your future self says thanks.",
    receipts: [
      {
        kind: "task" as const,
        title: "Write tests for sync worker",
        meta: "Due Fri · Working",
        verb: "Created",
        done: false,
        tag: { name: "Work", color: "teal" as TagColor },
      },
    ],
  },
  {
    id: "goal",
    label: "Move a goal",
    user: "Merged two more PRs for v2, bump my release goal",
    reaction: "🔥",
    reply: "Moved Ship v2 release up to 80%. Four milestones to go.",
    receipts: [{ kind: "goal" as const, title: "Ship v2 release", meta: "16 of 20 · 80%", verb: "Moved", done: false }],
  },
  {
    id: "settle",
    label: "Settle tasks",
    user: "Mark 'Pick up Maya's cupcakes' and 'Review Sam's PR' settled",
    reaction: "🧁",
    reply: "Both settled and saved to your diary. Cupcake mission complete.",
    receipts: [
      {
        kind: "task" as const,
        title: "Pick up cupcakes for Maya's birthday",
        meta: "Today",
        verb: "Settled",
        done: true,
        tag: { name: "Family", color: "amber" as TagColor },
      },
      {
        kind: "task" as const,
        title: "Review Sam's PR",
        meta: "Today",
        verb: "Settled",
        done: true,
        tag: { name: "Work", color: "blue" as TagColor },
      },
    ],
  },
] as const;

function TiboActionsPanel() {
  const [scenarioId, setScenarioId] = useState<(typeof TIBO_SCENARIOS)[number]["id"]>("create");
  const [spin, setSpin] = useState(0);
  const scenario = TIBO_SCENARIOS.find((item) => item.id === scenarioId) ?? TIBO_SCENARIOS[0];

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-(--card-shadow)">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-22 bg-gradient-to-b from-popover via-popover/75 to-transparent"
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3.5">
        <div className="flex flex-col items-center">
          <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-lg">
            <TiboMark spin={spin} idle={false} className="size-11" />
          </div>
          <div className="-mt-2 flex flex-col items-center rounded-2xl border border-bubble-tibo-border bg-bubble-tibo px-3.5 py-0.5 text-bubble-tibo-foreground shadow-md">
            <span className="text-[0.9375rem] leading-snug font-semibold">Tibo</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-end gap-4 px-4 pt-26 pb-4 sm:px-6">
        <Message align="end" className="items-end">
          <MessageContent className="pl-10">
            <div className="mb-3 flex flex-col items-end">
              <Bubble align="end" variant="outline" className="max-w-full">
                <BubbleContent className="relative rounded-2xl border-transparent! bg-bubble-me! px-4 py-2.5 pr-9! text-sm text-bubble-me-foreground!">
                  {scenario.user}
                  <span className="pointer-events-none absolute right-2.5 bottom-2 inline-flex text-tick-seen">
                    <CheckCheckIcon className="size-3.5" />
                  </span>
                </BubbleContent>
                <BubbleReactions side="bottom" align="start" className="ring-popover">
                  {scenario.reaction}
                </BubbleReactions>
              </Bubble>
            </div>
          </MessageContent>
        </Message>

        <Message align="start" className="items-end">
          <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
            <TiboMark idle={false} className="size-7" />
          </MessageAvatar>
          <MessageContent className="gap-2 pr-4">
            <Bubble align="start" variant="outline" className="max-w-[min(95%,30rem)]">
              <BubbleContent className="rounded-2xl border-bubble-tibo-border! bg-bubble-tibo! px-4 py-2.5 text-sm text-bubble-tibo-foreground!">
                {scenario.reply}
              </BubbleContent>
            </Bubble>

            <ul aria-label="What Tibo changed" className="flex w-full max-w-[26rem] flex-col gap-1.5">
              {scenario.receipts.map((receipt) => (
                <li
                  key={receipt.title}
                  data-tag={receipt.kind === "goal" ? "violet" : undefined}
                  className="flex items-start gap-3 rounded-xl border border-sidebar-border bg-sidebar py-2.5 pr-3 pl-2.5 text-sidebar-foreground"
                >
                  {receipt.kind === "task" ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border",
                        receipt.done ? "border-success bg-success text-background" : "border-muted-foreground/50",
                      )}
                    >
                      {receipt.done && <CheckIcon className="size-3" strokeWidth={3} />}
                    </span>
                  ) : (
                    <TargetIcon aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-tag" />
                  )}

                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={cn(
                        "text-sm leading-5 font-medium",
                        receipt.done && "text-muted-foreground line-through decoration-muted-foreground/60",
                      )}
                    >
                      {receipt.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {"tag" in receipt && receipt.tag && <TagChip name={receipt.tag.name} color={receipt.tag.color} />}
                      <span>{receipt.meta}</span>
                    </span>
                  </span>

                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />
                    {receipt.verb}
                  </span>
                </li>
              ))}
            </ul>
          </MessageContent>
        </Message>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-4 sm:px-6">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Try a Tibo command">
          {TIBO_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={scenarioId === item.id}
              onClick={() => {
                setScenarioId(item.id);
                setSpin((n) => n + 1);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                scenarioId === item.id
                  ? "border-primary/40 bg-primary text-primary-foreground"
                  : "border-bubble-tibo-border bg-bubble-tibo text-bubble-tibo-foreground hover:bg-accent/70",
              )}
            >
              {item.label}
            </button>
          ))}
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
            aria-label="Message Tibo"
            className="h-11 text-sm"
          />
          <InputGroupAddon align="inline-end" className="pr-1.5">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              className="rounded-full text-muted-foreground opacity-60"
            >
              <SendIcon className="size-4.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}

/* 4. Relays (Tibo ⇄ Tibo) */
function RelaysPanel() {
  return (
    <div className="grid flex-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-popover p-5 text-popover-foreground shadow-(--card-shadow)">
        <div className="flex items-center justify-between border-b pb-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <TiboMark idle={false} className="size-6" />
            Your chat
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
            Only your words
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3.5">
          <Message align="end" className="items-end">
            <MessageContent className="pl-6">
              <Bubble align="end" variant="outline" className="max-w-full">
                <BubbleContent className="relative rounded-2xl border-transparent! bg-bubble-me! px-3.5 py-2 pr-9! text-sm text-bubble-me-foreground!">
                  Ask @hannah if she wants Thai for dinner tonight
                  <span className="pointer-events-none absolute right-2.5 bottom-1.5 inline-flex text-tick-seen">
                    <CheckCheckIcon className="size-3.5" />
                  </span>
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>

          <Message align="start" className="items-end">
            <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
              <TiboMark idle={false} className="size-7" />
            </MessageAvatar>
            <MessageContent className="gap-1.5">
              <Bubble align="start" variant="outline" className="max-w-full">
                <BubbleContent className="rounded-2xl rounded-bl-md border-bubble-tibo-border! bg-bubble-tibo! px-3.5 py-2 text-sm text-bubble-tibo-foreground!">
                  Okay, I'll ask Hannah for you.
                </BubbleContent>
              </Bubble>
              <Bubble align="start" variant="outline" className="max-w-full">
                <BubbleContent className="rounded-2xl rounded-tl-md border-bubble-tibo-border! bg-bubble-tibo! px-3.5 py-2 text-sm text-bubble-tibo-foreground!">
                  Hannah says yes! Extra pad see ew and spring rolls for Leo.
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-(--card-shadow)">
        <div className="flex items-center justify-between border-b pb-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <TiboMark idle={false} className="size-6" />
            @hannah's chat
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            <ArrowLeftRightIcon aria-hidden="true" className="size-3" />
            Relay
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-3.5">
          <Message align="start" className="items-end">
            <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
              <TiboMark idle={false} className="size-7" />
            </MessageAvatar>
            <MessageContent>
              <Bubble align="start" variant="outline" className="max-w-full">
                <BubbleContent className="rounded-2xl border-bubble-tibo-border! bg-bubble-tibo! px-3.5 py-2 text-sm text-bubble-tibo-foreground!">
                  Hey, @rhys is asking if you want Thai for dinner tonight. What should I say?
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>

          <Message align="end" className="items-end">
            <MessageContent className="pl-6">
              <Bubble align="end" variant="outline" className="max-w-full">
                <BubbleContent className="relative rounded-2xl border-transparent! bg-bubble-me! px-3.5 py-2 pr-9! text-sm text-bubble-me-foreground!">
                  Tell him yes! Extra pad see ew and spring rolls for Leo.
                  <span className="pointer-events-none absolute right-2.5 bottom-1.5 inline-flex text-tick-seen">
                    <CheckCheckIcon className="size-3.5" />
                  </span>
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>

          <Message align="start" className="items-end">
            <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
              <TiboMark idle={false} className="size-7" />
            </MessageAvatar>
            <MessageContent>
              <Bubble align="start" variant="outline" className="max-w-full">
                <BubbleContent className="rounded-2xl border-bubble-tibo-border! bg-bubble-tibo! px-3.5 py-2 text-sm text-bubble-tibo-foreground!">
                  Sent it over.
                </BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
        </div>
      </div>
    </div>
  );
}

/* 5. Ask page — Tibo becomes your spokesperson */
const ASK_SAMPLES = [
  {
    id: "work",
    q: "What does Rhys build?",
    a: "From his shared bio: full-stack TypeScript apps, developer tools, and tiny weekend games with his kid.",
  },
  {
    id: "private",
    q: "What did Rhys buy for Leo's birthday?",
    a: "I don't know — you could reach out to @rhys directly.",
  },
] as const;

function AskPagePanel() {
  const [selected, setSelected] = useState<(typeof ASK_SAMPLES)[number]["id"]>("work");
  const [spin, setSpin] = useState(0);
  const current = ASK_SAMPLES.find((item) => item.id === selected) ?? ASK_SAMPLES[0];

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-(--card-shadow)">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-22 bg-gradient-to-b from-popover via-popover/75 to-transparent"
      />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-3.5">
        <div className="flex flex-col items-center">
          <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1 shadow-lg">
            <TiboMark spin={spin} idle={false} className="size-11" />
          </div>
          <div className="-mt-2 flex flex-col items-center rounded-2xl border border-bubble-tibo-border bg-bubble-tibo px-3.5 py-0.5 text-bubble-tibo-foreground shadow-md">
            <span className="text-[0.9375rem] leading-snug font-semibold">Tibo</span>
            <span className="-mt-0.5 pb-0.5 text-[0.6875rem] leading-tight text-muted-foreground">
              Answers for @rhys
            </span>
          </div>
        </div>
        <div className="pointer-events-auto absolute top-3.5 right-3.5 rounded-full border border-primary/40 bg-bubble-tibo shadow-md dark:border-bubble-tibo-border">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-primary">
            <UserRoundIcon className="size-3.5" />
            <span className="max-sm:hidden">Rhys's profile</span>
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-end gap-4 px-4 pt-28 pb-4 sm:px-6">
        <Message align="end" className="items-end">
          <MessageContent className="pl-10">
            <Bubble align="end" variant="outline" className="max-w-full">
              <BubbleContent className="rounded-2xl border-transparent! bg-bubble-me! px-4 py-2.5 text-sm text-bubble-me-foreground!">
                {current.q}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>

        <Message align="start" className="items-end">
          <MessageAvatar className="mb-0.5 min-w-7 bg-transparent">
            <TiboMark idle={false} className="size-7" />
          </MessageAvatar>
          <MessageContent className="pr-4">
            <Bubble align="start" variant="outline" className="max-w-[min(95%,30rem)]">
              <BubbleContent className="rounded-2xl border-bubble-tibo-border! bg-bubble-tibo! px-4 py-2.5 text-sm text-bubble-tibo-foreground!">
                {current.a}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pt-1 pb-4 sm:px-6">
        <div className="flex flex-wrap gap-1.5">
          {ASK_SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelected(item.id);
                setSpin((n) => n + 1);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected === item.id
                  ? "border-primary/40 bg-primary text-primary-foreground"
                  : "border-bubble-tibo-border bg-bubble-tibo text-bubble-tibo-foreground hover:bg-accent/70",
              )}
            >
              {item.q}
            </button>
          ))}
        </div>

        <InputGroup className="rounded-2xl! border-composer-border! bg-composer!">
          <InputGroupInput
            readOnly
            value=""
            placeholder="Ask about Rhys…"
            aria-label="Ask preview"
            className="h-11 text-sm"
          />
          <InputGroupAddon align="inline-end" className="pr-1.5">
            <InputGroupButton
              type="button"
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              className="rounded-full text-muted-foreground opacity-60"
            >
              <SendIcon className="size-4.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <p className="px-1 text-center text-[0.6875rem] text-muted-foreground">
          Tibo is an AI answering for Rhys from what they shared. It can't see their chat, memories, or board.
        </p>
      </div>
    </div>
  );
}

/* 6. Notes and Sessions */
function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function NotesSessionsPanel() {
  const [planned, setPlanned] = useState(25);
  const [left, setLeft] = useState(24 * 60 + 18);
  const [running, setRunning] = useState(true);
  const [note, setNote] = useState("Leo helped me name a TypeScript variable 'dinosaur'.");
  const [posted, setPosted] = useState("Made chocolate chip pancakes before morning standup.");
  const [privacy, setPrivacy] = useState<Privacy>("connections");
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const extend = (m: number) => {
    setPlanned((p) => Math.min(600, p + m));
    setLeft((s) => s + m * 60);
  };

  const submitNote = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    setPosted(trimmed);
    setNote("");
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="flex flex-1 flex-col justify-between rounded-2xl [--card-spacing:--spacing(5)]">
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-3.5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                running ? "animate-focus-breathe bg-focus" : "bg-muted-foreground/50",
              )}
            />
            <span>{running ? "Refactor webhook retries" : "Paused: Refactor webhook retries"}</span>
          </p>

          <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
            <p
              className={cn(
                "text-[3.5rem] leading-none font-extralight tracking-[-0.045em] tabular-nums sm:text-[4rem]",
                !running && "text-muted-foreground",
              )}
            >
              {formatClock(left)}
            </p>
            <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-focus/15">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300 ease-linear",
                  running ? "bg-focus" : "bg-focus/40",
                )}
                style={{ width: `${Math.min(100, (left / (planned * 60)) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{planned} min planned</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <Button size="sm" className="rounded-full px-4" onClick={() => setRunning((r) => !r)}>
              {running ? <PauseIcon /> : <PlayIcon />}
              {running ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full tabular-nums" onClick={() => extend(5)}>
              +5
            </Button>
            <Button variant="outline" size="sm" className="rounded-full tabular-nums" onClick={() => extend(15)}>
              +15
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground"
              onClick={() => {
                setPlanned(25);
                setLeft(24 * 60 + 18);
                setRunning(true);
              }}
            >
              <SquareIcon className="fill-current" />
              Reset
            </Button>
          </div>
        </CardContent>

        <div className="flex items-center gap-3 border-t px-5 py-3 text-sm">
          <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">9:15 AM</span>
          <span className="min-w-0 flex-1 truncate">Code review with Sam</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">30m of 30m</span>
          <span className="inline-flex h-5 items-center rounded-full bg-success/12 px-2 text-xs font-medium text-success-ink">
            Completed
          </span>
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4 shadow-(--card-shadow)">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitNote();
          }}
          className="flex gap-3 rounded-xl border bg-background/50 px-3.5 py-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        >
          <span
            data-tag="teal"
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-tag text-xs font-semibold text-background"
          >
            RS
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_BODY_MAX_LENGTH}
              placeholder="What happened today?"
              aria-label="Daily note preview"
              className="min-w-0 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <div className="flex flex-wrap items-center gap-1 border-t pt-2">
              <PrivacyPill value={privacy} onChange={setPrivacy} />
              <LiveToggle value={live} onChange={setLive} />
              <div className="ml-auto flex items-center gap-2.5">
                <NoteRing length={note.length} />
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <Button type="submit" size="sm" className="h-7 rounded-full px-4" disabled={!note.trim()}>
                  Post
                </Button>
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-baseline justify-between gap-3 px-1 text-xs text-muted-foreground">
          <span className="truncate text-foreground">“{posted}”</span>
          <span className="shrink-0 tabular-nums">10:42 AM</span>
        </div>
      </div>
    </div>
  );
}

/* 7. Diary (exact DiaryDayCard layout) */
function DiaryPanel() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <section aria-label="Today's diary" className="flex flex-col gap-2">
        <h3 className="flex items-baseline gap-2 px-1">
          <span className="font-semibold">Sat, Nov 21</span>
          <span className="text-sm text-muted-foreground">Today</span>
        </h3>

        <div className="flex flex-col rounded-2xl border bg-card shadow-(--card-shadow)">
          <div className="flex flex-col px-4 pt-3.5 pb-2 sm:px-5">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListChecksIcon className="size-3.5" />
              Tasks
              <span className="tabular-nums">2</span>
            </h4>
            <ul className="flex flex-col">
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">11:22 AM</time>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>Fix OAuth redirect bug before standup</span>
                  <UsersIcon aria-hidden="true" className="size-3 self-center text-muted-foreground" />
                </div>
              </li>
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">10:05 AM</time>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>Order Leo's surprise Lego set</span>
                  <LockIcon aria-hidden="true" className="size-3 self-center text-muted-foreground" />
                </div>
              </li>
            </ul>
          </div>

          <div className="flex flex-col border-t px-4 pt-3.5 pb-2 sm:px-5">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <RepeatIcon className="size-3.5" />
              Habits
              <span className="tabular-nums">1</span>
            </h4>
            <ul className="flex flex-col">
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">8:14 AM</time>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>Evening walk with Hannah</span>
                  <span className="text-sm text-muted-foreground">Goal met</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="flex flex-col border-t px-4 pt-3.5 pb-2 sm:px-5">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TargetIcon className="size-3.5" />
              Goals
              <span className="tabular-nums">1</span>
            </h4>
            <ul className="flex flex-col">
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">11:22 AM</time>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>Ship v2 release</span>
                  <span className="text-sm text-muted-foreground">Reached 70%</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="flex flex-col border-t px-4 pt-3.5 pb-2 sm:px-5">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TimerIcon className="size-3.5" />
              Focus sessions
              <span className="tabular-nums">1</span>
            </h4>
            <ul className="flex flex-col">
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">9:30 AM</time>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span>Refactor webhook retries</span>
                  <span className="text-sm text-muted-foreground">25 min</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="flex flex-col border-t px-4 pt-3.5 pb-2.5 sm:px-5">
            <h4 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <NotebookPenIcon className="size-3.5" />
              Notes
              <span className="tabular-nums">1</span>
            </h4>
            <ul className="flex flex-col">
              <li className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-2 py-1.5 sm:grid-cols-[5rem_1fr]">
                <time className="text-sm text-muted-foreground tabular-nums">11:45 AM</time>
                <span>Leo helped me name a TypeScript variable 'dinosaur'.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

/* 8. Profile & contribution graph */
const GRAPH_WEEKS = 28;
const GRAPH_CELLS = Array.from({ length: GRAPH_WEEKS * 7 }, (_, i) => {
  const w = Math.sin(i * 0.38) + Math.cos(i * 0.16);
  const h = (i * 37 + 13) % 11;
  if (h < 2) return 0;
  if (w > 0.88 || h === 10) return 4;
  if (w > 0.25) return 3;
  if (w > -0.45) return 2;
  return 1;
});

const LEVEL_TEXT: Record<number, string> = {
  0: "Nothing",
  1: "2 things",
  2: "4 things",
  3: "6 things",
  4: "9 things",
};

const GRAPH_MONTHS = [
  { col: 1, label: "May" },
  { col: 5, label: "Jun" },
  { col: 9, label: "Jul" },
  { col: 14, label: "Aug" },
  { col: 18, label: "Sep" },
  { col: 22, label: "Oct" },
  { col: 26, label: "Nov" },
] as const;

const GRAPH_WEEKDAYS = [
  { row: 2, label: "Mon" },
  { row: 4, label: "Wed" },
  { row: 6, label: "Fri" },
] as const;

function ProfileGraphPanel() {
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const showTip = (index: number, element: HTMLElement) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;
    const cell = element.getBoundingClientRect();
    setTip({ index, x: cell.left + cell.width / 2 - box.left, y: cell.top - box.top });
  };

  const frameWidth = frameRef.current?.clientWidth ?? 0;

  return (
    <div data-tag="teal" className="flex flex-1 flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-(--card-shadow)">
        <div aria-hidden="true" className="profile-band h-20 sm:h-24" />
        <div className="flex flex-col gap-3 px-5 pb-4">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
            <span className="grid size-20 place-items-center rounded-full bg-tag text-xl font-semibold text-background ring-4 ring-card">
              RS
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="pointer-events-none" tabIndex={-1}>
                <TiboMark idle={false} className="size-4" />
                Ask Tibo
              </Button>
              <Button type="button" variant="secondary" size="sm" className="pointer-events-none" tabIndex={-1}>
                Connected
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-xl font-semibold tracking-tight">Rhys Sullivan</p>
            <p className="text-sm text-muted-foreground">@rhys</p>
            <p className="text-xs text-muted-foreground">Joined November 2026</p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <span className="font-medium">24 connections</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums">742</span>
              <span className="text-xs text-muted-foreground">points</span>
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col justify-between gap-3 rounded-2xl border bg-card p-5 shadow-(--card-shadow)">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-sm font-semibold">742 things done in the last year</h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
            Less
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} data-level={level} className="contribution-cell size-2.75 rounded-[3px]" />
            ))}
            More
          </div>
        </div>

        <div ref={frameRef} className="relative">
          <div className="overflow-x-auto pb-1">
            <div
              role="group"
              aria-label="Sample contribution graph"
              className="grid min-w-[26rem] gap-[3px] sm:min-w-0"
              style={{
                gridTemplateColumns: `auto repeat(${GRAPH_WEEKS}, minmax(0, 1fr))`,
                gridTemplateRows: "auto",
              }}
            >
              {GRAPH_MONTHS.map(({ col, label }) => (
                <span
                  key={label}
                  aria-hidden="true"
                  className="pb-0.5 text-xs whitespace-nowrap text-muted-foreground"
                  style={{ gridColumn: `${col + 1} / span 3`, gridRow: 1 }}
                >
                  {label}
                </span>
              ))}
              {GRAPH_WEEKDAYS.map(({ row, label }) => (
                <span
                  key={label}
                  aria-hidden="true"
                  className="self-center pr-1.5 text-[0.6875rem] leading-none text-muted-foreground"
                  style={{ gridColumn: 1, gridRow: row + 1 }}
                >
                  {label}
                </span>
              ))}
              {GRAPH_CELLS.map((level, index) => {
                const week = Math.floor(index / 7);
                const day = index % 7;
                return (
                  <button
                    key={index}
                    type="button"
                    data-level={level}
                    aria-label={`${LEVEL_TEXT[level]} done`}
                    onPointerEnter={(event) => showTip(index, event.currentTarget)}
                    onPointerLeave={() => setTip((current) => (current?.index === index ? null : current))}
                    onFocus={(event) => showTip(index, event.currentTarget)}
                    onBlur={() => setTip(null)}
                    className="contribution-cell aspect-square w-full rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
                    style={{ gridColumn: week + 2, gridRow: day + 2 }}
                  />
                );
              })}
            </div>
          </div>

          {tip && (
            <div
              role="presentation"
              className="pointer-events-none absolute z-20 rounded-md bg-foreground px-2.5 py-1 text-xs whitespace-nowrap text-background shadow-sm"
              style={{
                left: Math.min(Math.max(tip.x, 56), Math.max(56, frameWidth - 56)),
                top: tip.y - 6,
                transform: "translate(-50%, -100%)",
              }}
            >
              {LEVEL_TEXT[GRAPH_CELLS[tip.index] ?? 0]} done
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
