import type { FocusSession, Privacy } from "@dueboard/api/rpc";
import { Link } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import { CheckIcon, PauseIcon, PlayIcon, PlusIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { LiveToggle, PrivacyPill } from "@/components/privacy-controls";
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
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import {
  remainingAt,
  useActiveSession,
  useFinishedSession,
  useOpenSessionsTab,
  useSessionActions,
  useTicker,
  useTimerSession,
} from "@/hooks/use-sessions";
import { failureMessage } from "@/hooks/use-tasks";
import { formatTime } from "@/lib/dates";
import {
  DEFAULT_MINUTES,
  EXTEND_PRESETS,
  SESSION_LABEL_MAX_LENGTH,
  SESSION_MINUTES_MAX,
  START_PRESETS,
  STATUS_LABEL,
  cleanLabel,
  formatCountdown,
  formatFocused,
  formatMinutes,
  parseMinutes,
  sessionName,
} from "@/lib/sessions";
import { cn } from "@/lib/utils";

// Focus sessions on `/now` and in the header: the widget (start, the
// countdown with pause / extend / stop, the completion moment), the day's
// list, the header timer, and `SessionSync`, which keeps them all honest.

/**
 * The Sessions tab on today: the widget for the active session (or the
 * start form), then the day's other sessions.
 */
export function SessionWidget({ sessions }: { sessions: readonly FocusSession[] | undefined }) {
  const active = useActiveSession();
  const { finished, dismiss } = useFinishedSession();
  const [starting, setStarting] = useState(false);
  const { session } = active;
  const now = useTicker(session?.status === "running");
  const remaining = active.remainingAt(now);
  const { reload } = useSessionActions();

  // Ran out here: the completion moment, until dismissed or replaced.
  const done =
    finished && (!session || (session.id === finished.id && remaining === 0)) ? finished : null;
  // The day's other sessions: not the one in the widget.
  const others = (sessions ?? []).filter((item) => item.id !== session?.id && item.id !== done?.id);

  let main: ReactNode;
  if (session === undefined) {
    main = active.failed ? (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
        Couldn't load your focus session.
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    ) : (
      <WidgetSkeleton />
    );
  } else if (done) {
    main = (
      <DoneView
        session={done}
        onAgain={() => {
          dismiss();
          setStarting(false);
        }}
      />
    );
  } else if (session && !starting) {
    main = <ActiveView session={session} remaining={remaining} now={now} onNew={() => setStarting(true)} />;
  } else {
    main = <StartForm active={session} onStarted={() => setStarting(false)} onCancel={session ? () => setStarting(false) : undefined} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {main}
      {others.length > 0 && <SessionList sessions={others} label="Earlier today" />}
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 py-4" aria-hidden="true">
      <Skeleton className="h-12 w-40" />
      <Skeleton className="h-1.5 w-full max-w-sm" />
      <Skeleton className="h-8 w-56" />
    </div>
  );
}

const MINUTES_KEY = "dueboard-session-minutes";

/** The length last started, remembered per viewer. Read after mount, like other stored choices. */
function useRememberedMinutes() {
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  useEffect(() => {
    try {
      const stored = parseMinutes(localStorage.getItem(MINUTES_KEY) ?? "");
      if (stored) setMinutes(stored);
    } catch {
      // Storage blocked: start from the default.
    }
  }, []);
  const remember = (value: number) => {
    try {
      localStorage.setItem(MINUTES_KEY, String(value));
    } catch {
      // Not remembered this time.
    }
  };
  return [minutes, setMinutes, remember] as const;
}

/** The `ActiveSessionExists` error's session, when that's why a start failed. */
const conflictOf = (exit: Exit.Exit<unknown, unknown>): FocusSession | null => {
  if (Exit.isSuccess(exit)) return null;
  const error = Cause.squash(exit.cause);
  return error && typeof error === "object" && "_tag" in error && error._tag === "ActiveSessionExists"
    ? (error as unknown as { session: FocusSession }).session
    : null;
};

/**
 * Starting: a length (presets or custom), an optional label, who sees it
 * and Live (from the user's defaults). Starting while another session is
 * active asks first, since that one will be stopped.
 */
function StartForm({
  active,
  onStarted,
  onCancel,
}: {
  active: FocusSession | null;
  onStarted: () => void;
  onCancel?: (() => void) | undefined;
}) {
  const settings = useBootstrap()?.settings;
  const { start } = useSessionActions();
  const [minutes, setMinutes, rememberMinutes] = useRememberedMinutes();
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [shareToLive, setShareToLive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<FocusSession | null>(null);
  const customId = useId();

  // A remembered length that isn't a preset shows in the Other field.
  useEffect(() => {
    if (!(START_PRESETS as readonly number[]).includes(minutes)) setCustom(String(minutes));
  }, [minutes]);

  const shownPrivacy = privacy ?? settings?.defaultPrivacy ?? "connections";
  const shownShare = shareToLive ?? settings?.defaultShareToLive ?? true;
  const customMinutes = custom ? parseMinutes(custom) : null;
  const chosen = custom ? customMinutes : minutes;

  const submit = async (replaceActive: boolean) => {
    if (!chosen || busy) return;
    setBusy(true);
    const labelText = cleanLabel(label);
    const exit = await start({
      minutes: chosen,
      privacy: shownPrivacy,
      shareToLive: shownShare,
      ...(labelText ? { label: labelText } : {}),
      ...(replaceActive ? { replaceActive: true } : {}),
    });
    setBusy(false);
    if (Exit.isSuccess(exit)) {
      rememberMinutes(chosen);
      setConflict(null);
      onStarted();
      return;
    }
    const other = conflictOf(exit);
    if (other) setConflict(other);
    else toast.error(failureMessage(exit, "Couldn't start the session."));
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        // Known to be active here: ask straight away instead of after a refusal.
        if (active) setConflict(active);
        else void submit(false);
      }}
    >
      <div role="radiogroup" aria-label="Session length" className="flex flex-wrap items-center justify-center gap-1.5">
        {START_PRESETS.map((preset) => {
          const picked = !custom && minutes === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={picked}
              onClick={() => {
                setMinutes(preset);
                setCustom("");
              }}
              className={cn(
                "h-9 min-w-14 rounded-full border px-3 text-sm tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                picked
                  ? "border-focus/40 bg-focus-soft font-medium text-focus-ink"
                  : "bg-background/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {preset}
              <span className="text-xs opacity-70"> min</span>
            </button>
          );
        })}
        <label
          htmlFor={customId}
          className={cn(
            "flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50",
            custom ? "border-focus/40 bg-focus-soft text-focus-ink" : "bg-background/50 text-muted-foreground",
          )}
        >
          <input
            id={customId}
            inputMode="numeric"
            value={custom}
            onChange={(event) => setCustom(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="Other"
            aria-label={`Custom length in minutes, 1 to ${SESSION_MINUTES_MAX}`}
            aria-invalid={custom !== "" && customMinutes === null}
            className="w-11 bg-transparent text-center tabular-nums outline-none placeholder:text-muted-foreground/70"
          />
          <span className="text-xs opacity-70">min</span>
        </label>
      </div>
      {custom !== "" && customMinutes === null && (
        <p className="text-center text-xs text-destructive">Pick 1 to {SESSION_MINUTES_MAX} minutes.</p>
      )}

      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={SESSION_LABEL_MAX_LENGTH}
        placeholder="What are you focusing on? (optional)"
        aria-label="Label, optional"
        autoComplete="off"
        className="h-9 rounded-lg border bg-background/50 px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div className="flex flex-wrap items-center gap-1">
        <PrivacyPill value={shownPrivacy} onChange={setPrivacy} />
        <LiveToggle value={shownShare} onChange={setShareToLive} />
        <div className="ml-auto flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onCancel}>
              Back
            </Button>
          )}
          <Button type="submit" size="sm" className="rounded-full px-4" disabled={!chosen || busy}>
            {busy ? <Spinner /> : <PlayIcon />}
            Start {chosen ? formatMinutes(chosen) : ""}
          </Button>
        </div>
      </div>

      <ReplaceDialog
        session={conflict}
        busy={busy}
        onCancel={() => setConflict(null)}
        onConfirm={() => void submit(true)}
      />
    </form>
  );
}

/** Warns that starting will stop the active session, showing which one and its time left. */
function ReplaceDialog({
  session,
  busy,
  onCancel,
  onConfirm,
}: {
  session: FocusSession | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Kept while the dialog closes, so its text doesn't vanish mid-animation.
  const shown = useRef(session);
  if (session) shown.current = session;
  const now = useTicker(session?.status === "running");
  const current = shown.current;

  return (
    <AlertDialog open={session !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop your current session?</AlertDialogTitle>
          <AlertDialogDescription>
            {current && (
              <>
                “{sessionName(current)}” is {current.status === "paused" ? "paused" : "running"} with{" "}
                <span className="font-medium text-foreground tabular-nums">{formatCountdown(remainingAt(current, now))}</span>{" "}
                left. Starting a new session stops it, and it's saved as stopped.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              // Stays open until the start answers.
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy && <Spinner />}
            Stop it and start
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Running or paused: the label, the big countdown over a bar that drains
 * as time passes, when it ends, and the controls.
 */
function ActiveView({
  session,
  remaining,
  now,
  onNew,
}: {
  session: FocusSession;
  remaining: number;
  now: number;
  onNew: () => void;
}) {
  const timeZone = useTimeZone();
  const { pause, resume, extend, stop } = useSessionActions();
  const [busy, setBusy] = useState<"toggle" | "extend" | "stop" | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const running = session.status === "running";
  const planned = session.plannedMinutes * 60_000;
  const share = planned > 0 ? Math.min(1, remaining / planned) : 0;
  const room = SESSION_MINUTES_MAX - session.plannedMinutes;

  const act = async (kind: "toggle" | "extend" | "stop", call: () => Promise<Exit.Exit<unknown, unknown>>, failure: string) => {
    setBusy(kind);
    const exit = await call();
    setBusy(null);
    if (Exit.isFailure(exit)) toast.error(failureMessage(exit, failure));
    return exit;
  };
  const addMinutes = (minutes: number) =>
    act("extend", () => extend(session.id, minutes), "Couldn't extend the session.");

  return (
    <section aria-label="Focus session" className="flex flex-col items-center gap-3 pt-1">
      <p className="flex max-w-full items-center gap-2 text-sm text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", running ? "animate-focus-breathe bg-focus" : "bg-muted-foreground/50")}
        />
        <span className="truncate">{running ? sessionName(session) : `Paused: ${sessionName(session)}`}</span>
      </p>

      <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
        <p
          role="timer"
          aria-label={`${formatCountdown(remaining)} left`}
          className={cn(
            "text-[3.5rem] leading-none font-extralight tracking-[-0.045em] tabular-nums sm:text-[4.25rem]",
            !running && "text-muted-foreground",
          )}
        >
          {formatCountdown(remaining)}
        </p>
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-focus/15">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-linear",
              running ? "bg-focus" : "bg-focus/40",
            )}
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {running
            ? `Ends at ${formatTime(new Date(now + remaining), timeZone)}, ${formatMinutes(session.plannedMinutes)} planned`
            : `${formatMinutes(session.plannedMinutes)} planned. Resume to keep going.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Button
          size="sm"
          className="rounded-full px-4"
          disabled={busy !== null}
          onClick={() =>
            void act(
              "toggle",
              () => (running ? pause(session.id) : resume(session.id)),
              running ? "Couldn't pause the session." : "Couldn't resume the session.",
            )
          }
        >
          {busy === "toggle" ? <Spinner /> : running ? <PauseIcon /> : <PlayIcon />}
          {running ? "Pause" : "Resume"}
        </Button>
        {EXTEND_PRESETS.map((minutes) => (
          <Button
            key={minutes}
            variant="outline"
            size="sm"
            className="rounded-full tabular-nums"
            disabled={busy !== null || minutes > room}
            aria-label={`Add ${minutes} minutes`}
            title={minutes > room ? `A session can last at most ${SESSION_MINUTES_MAX} minutes.` : undefined}
            onClick={() => void addMinutes(minutes)}
          >
            +{minutes}
          </Button>
        ))}
        <ExtendCustom room={room} disabled={busy !== null} onAdd={addMinutes} />
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-muted-foreground hover:text-destructive"
          disabled={busy !== null}
          onClick={() => setConfirmStop(true)}
        >
          {busy === "stop" ? <Spinner /> : <SquareIcon className="fill-current" />}
          Stop
        </Button>
      </div>
      <button
        type="button"
        onClick={onNew}
        className="rounded text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Start a different session
      </button>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this session?</AlertDialogTitle>
            <AlertDialogDescription>
              You've focused {formatFocused({ ...session, elapsedMs: planned - remaining })} of{" "}
              {formatMinutes(session.plannedMinutes)}. It's saved as stopped, and only completed sessions count on
              your activity graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void act("stop", () => stop(session.id), "Couldn't stop the session.")}
            >
              Stop session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** "+…": add any number of minutes, up to what the 600-minute cap leaves. */
function ExtendCustom({
  room,
  disabled,
  onAdd,
}: {
  room: number;
  disabled: boolean;
  onAdd: (minutes: number) => Promise<Exit.Exit<unknown, unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputId = useId();
  const value = parseMinutes(text, room);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="rounded-full"
          disabled={disabled || room < 1}
          aria-label="Add other minutes"
          title="Add other minutes"
        >
          <PlusIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!value) return;
            setOpen(false);
            setText("");
            await onAdd(value);
          }}
        >
          <label className="text-sm font-medium" htmlFor={inputId}>
            Add minutes
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              autoFocus
              inputMode="numeric"
              value={text}
              onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder={`1 to ${room}`}
              className="h-8 min-w-0 flex-1 rounded-lg border bg-background/50 px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="submit" size="sm" disabled={!value}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Up to {formatMinutes(room)} more; a session lasts at most {formatMinutes(SESSION_MINUTES_MAX)}.
          </p>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The completion moment: the bar full in the done color, a check that
 * bursts once (not with reduced motion), and how long was focused.
 */
function DoneView({ session, onAgain }: { session: FocusSession; onAgain: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      role="status"
      aria-label="Session complete"
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
      className="flex flex-col items-center gap-3 pt-1 text-center"
    >
      <span className="relative grid size-11 place-items-center rounded-full bg-success text-background">
        {!reduced && (
          <>
            <span aria-hidden="true" className="absolute inset-0 animate-habit-burst rounded-full border-2 border-success" />
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-habit-burst rounded-full border border-success [animation-delay:160ms]"
            />
          </>
        )}
        <CheckIcon className="size-6" strokeWidth={3} />
      </span>
      <div className="flex w-full max-w-sm flex-col items-center gap-2.5">
        <p className="text-2xl font-light tracking-tight text-success">
          {formatMinutes(session.plannedMinutes)} of focus
        </p>
        <div aria-hidden="true" className="h-1.5 w-full rounded-full bg-success" />
        <p className="max-w-full truncate text-sm text-muted-foreground">{sessionName(session)} is complete.</p>
      </div>
      <Button size="sm" variant="outline" className="rounded-full" onClick={onAgain}>
        <PlayIcon />
        Start another
      </Button>
    </motion.section>
  );
}

const STATUS_CLASS: Record<FocusSession["status"], string> = {
  running: "bg-focus-soft text-focus-ink",
  paused: "bg-focus-soft text-focus-ink",
  completed: "bg-success/12 text-success-ink",
  stopped: "bg-muted text-muted-foreground",
};

export function SessionStatusPill({ status }: { status: FocusSession["status"] }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium", STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A day's sessions as rows: start time, name, focused of planned and
 * status. Read-only unless `onDelete` is given.
 */
export function SessionList({
  sessions,
  label,
  onDelete,
}: {
  sessions: readonly FocusSession[];
  label: string;
  onDelete?: (session: FocusSession) => void;
}) {
  const timeZone = useTimeZone();
  return (
    <ul aria-label={label} className="flex flex-col">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="group/session flex min-h-10 items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/40"
        >
          <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatTime(session.startedAt, timeZone)}
          </span>
          {/* On phones the time it ran goes under the name, so the name keeps the width. */}
          <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-0">
            <span
              className={cn("min-w-0 truncate sm:flex-1 max-sm:w-full", !session.label && "text-muted-foreground")}
            >
              {sessionName(session)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatFocused(session)} <span className="opacity-70">of {formatMinutes(session.plannedMinutes)}</span>
            </span>
          </div>
          <SessionStatusPill status={session.status} />
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover/session:opacity-100 md:focus-visible:opacity-100"
              aria-label={`Delete ${sessionName(session)}`}
              onClick={() => onDelete(session)}
            >
              <Trash2Icon />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The active session's small timer for the app's top row: a breathing dot
 * and the time left (a pause mark while paused). It opens `/now`'s
 * Sessions tab. Nothing shows without an active session.
 */
export function SessionIndicator({ className }: { className?: string }) {
  const { session, remainingAt } = useTimerSession();
  const now = useTicker(session?.status === "running");
  const openTab = useOpenSessionsTab();
  if (!session) return null;
  const running = session.status === "running";
  const left = formatCountdown(remainingAt(now));
  return (
    <Link
      to="/now"
      search={{ date: undefined }}
      onClick={openTab}
      aria-label={`${running ? "Focus session" : "Paused session"}: ${left} left. Open it on Now.`}
      title={sessionName(session)}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full bg-session-pill px-3 text-sm font-medium text-session-pill-foreground tabular-nums ring-1 ring-session-pill-foreground/15 outline-none transition-colors hover:bg-session-pill/80 focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {running ? (
        <span aria-hidden="true" className="size-2 animate-focus-breathe rounded-full bg-session-pill-dot" />
      ) : (
        <PauseIcon aria-hidden="true" className="size-3.5" />
      )}
      {left}
      {session.label && <span className="max-w-32 truncate font-normal opacity-80 max-lg:hidden">{session.label}</span>}
    </Link>
  );
}

const TITLE_PREFIX = /^\d+:\d{2}(:\d{2})? · /;

/**
 * Keeps sessions honest across the app (mounted once, in the `_app`
 * layout): refetches the active session when the tab comes back or gets
 * focus, catches the moment the countdown reaches 0 (the completion moment,
 * then a refetch so the server's completion shows), and puts the time left
 * in the tab's title while running.
 */
export function SessionSync() {
  const { session, remainingAt, waiting } = useActiveSession();
  const { reload, reloadActive, finish } = useSessionActions();
  const running = session?.status === "running";
  const now = useTicker(running, 250);
  const left = running ? remainingAt(now) : null;
  // A reload cancels the requests in flight, so a slow answer would never land.
  const inFlight = useRef(waiting);
  inFlight.current = waiting;
  const latest = useRef(session);
  latest.current = session;

  // Checks only the active session (cheap); when its answer shows it changed
  // (completed while away, stopped elsewhere), every session list reloads,
  // `/now`'s days included.
  const checkingFrom = useRef<{ id: string | null; status: string | null } | null>(null);
  const check = useCallback(() => {
    if (inFlight.current) return;
    checkingFrom.current = { id: latest.current?.id ?? null, status: latest.current?.status ?? null };
    void reloadActive();
  }, [reloadActive]);
  useEffect(() => {
    const before = checkingFrom.current;
    if (!before || waiting) return;
    checkingFrom.current = null;
    if ((session?.id ?? null) !== before.id || (session?.status ?? null) !== before.status) void reload();
  }, [session, waiting, reload]);

  // Back from another tab, a sleeping laptop or another window: ask again.
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || inFlight.current || Date.now() - last < 2000) return;
      last = Date.now();
      check();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [check]);

  // Reached 0: show the moment, then let the server's completion replace the
  // session. If it's still running on the next answer (an answer in flight),
  // ask again every few seconds.
  const endedId = session && left === 0 ? session.id : null;
  const finishedId = useRef<string | null>(null);
  useEffect(() => {
    const ended = latest.current;
    if (!endedId || !ended) return;
    if (finishedId.current !== endedId) {
      finishedId.current = endedId;
      finish(ended);
      toast.success(`${formatMinutes(ended.plannedMinutes)} of focus. Session complete.`);
    }
    check();
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [endedId, finish, check]);

  // The tab's title starts with the time left while running.
  const countdown = left !== null && left > 0 ? formatCountdown(left) : null;
  useEffect(() => {
    const base = document.title.replace(TITLE_PREFIX, "");
    document.title = countdown ? `${countdown} · ${base}` : base;
  }, [countdown]);
  useEffect(() => () => void (document.title = document.title.replace(TITLE_PREFIX, "")), []);

  return null;
}
