import {
  tiboFileUrl,
  type TiboActivity,
  type TiboActivityKind,
  type TiboActivityThread,
  type TiboSentFile,
} from "@dueboard/api/tibo";
import {
  AlarmClockIcon,
  ArrowLeftRightIcon,
  BrainIcon,
  HistoryIcon,
  ImagesIcon,
  LayoutGridIcon,
  CircleCheckIcon,
  CircleIcon,
  CircleSlashIcon,
  CircleXIcon,
  CoffeeIcon,
  EyeIcon,
  FileTextIcon,
  LayersIcon,
  MessageCircleIcon,
  PenLineIcon,
  SparklesIcon,
  SunriseIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { FileCard, PhotoViewer } from "@/components/tibo-attachments";
import { TiboMark } from "@/components/tibo-mark";
import { TiboMemoryList } from "@/components/tibo-memory-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTiboThread } from "@/hooks/use-tibo";
import { useActivityLog, useCurrentActivity, useLastActivity, useSentFiles } from "@/hooks/use-tibo-activity";
import { cn } from "@/lib/utils";

export type TiboSideTab = "overview" | "media" | "memory" | "activity";

const TABS: readonly { value: TiboSideTab; label: string; icon: LucideIcon }[] = [
  { value: "overview", label: "Overview", icon: LayoutGridIcon },
  { value: "media", label: "Media", icon: ImagesIcon },
  { value: "memory", label: "Memory", icon: BrainIcon },
  { value: "activity", label: "Activity", icon: HistoryIcon },
];

export function TiboSide({ className, trailing }: { className?: string; trailing?: React.ReactNode }) {
  const [tab, setTab] = React.useState<TiboSideTab>("overview");
  const index = TABS.findIndex((entry) => entry.value === tab);
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as TiboSideTab)} className={cn("min-h-0 gap-0", className)}>
      <div className="shrink-0 border-b border-tibo-side-border">
        <TiboProfile trailing={trailing} />
        <div className="px-4 pb-3">
          <TabsList className="relative grid h-auto w-full grid-cols-4 gap-0 rounded-2xl group-data-horizontal/tabs:h-auto border border-bubble-tibo-border/70 bg-tibo-soft/80 p-1 shadow-inner dark:border-white/8 dark:bg-white/4">
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-xl border border-bubble-tibo-border bg-bubble-tibo shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-white/10 dark:bg-white/12"
              style={{ transform: `translateX(${index * 100}%)` }}
            />
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative z-10 h-auto flex-col gap-0.5 rounded-xl border-0 px-1 py-1.5 text-[0.6875rem] font-medium text-muted-foreground shadow-none! hover:text-foreground data-active:bg-transparent! data-active:text-foreground dark:data-active:border-transparent dark:data-active:bg-transparent!"
              >
                <Icon aria-hidden="true" className="size-4!" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <TabsContent value="overview" className="p-4">
          <Overview showActivity={() => setTab("activity")} />
        </TabsContent>
        <TabsContent value="media" className="p-4">
          <Media />
        </TabsContent>
        <TabsContent value="memory" className="px-4 pb-4">
          <TiboMemoryList compact />
        </TabsContent>
        <TabsContent value="activity" className="p-4">
          <ActivityLog />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function TiboProfile({ trailing }: { trailing?: React.ReactNode }) {
  const { connected } = useTiboThread();
  const { current } = useCurrentActivity();
  const [spins, setSpins] = React.useState(0);
  React.useEffect(() => {
    if (current) setSpins((n) => n + 1);
  }, [current?.id]);
  const state = !connected ? "offline" : current ? "working" : "active";
  return (
    <div className="relative flex flex-col items-center px-4 pt-7 pb-5 text-center">
      {trailing && <div className="absolute top-3 right-3">{trailing}</div>}
      <div className="relative">
        <div className="rounded-full border border-bubble-tibo-border bg-bubble-tibo p-1.5 shadow-md">
          <TiboMark spin={spins} idle={state !== "offline"} className="size-14" />
        </div>
        <span className="absolute right-0.5 bottom-0.5 grid size-4.5 place-items-center rounded-full bg-bubble-tibo">
          {state === "working" && (
            <span aria-hidden="true" className="absolute size-3 animate-ping rounded-full bg-tibo-live/60 motion-reduce:hidden" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "relative size-3 rounded-full",
              state === "working" ? "bg-tibo-live" : state === "active" ? "bg-success" : "bg-muted-foreground/50",
            )}
          />
        </span>
      </div>
      <p className="mt-3 text-lg leading-tight font-semibold">Tibo</p>
      <p aria-live="polite" className="mt-1 max-w-full truncate text-xs text-muted-foreground">
        {state === "working" ? current?.label : state === "active" ? "Active now" : "Offline, reconnecting…"}
      </p>
    </div>
  );
}

function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn("bg-tibo-soft", className)} />;
}

function LoadFailed({ what, retry }: { what: string; retry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-bubble-tibo-border p-4 text-sm">
      <p className="text-muted-foreground">Couldn't load {what}.</p>
      <Button variant="outline" size="sm" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

const KIND_ICON: Record<TiboActivityKind, LucideIcon> = {
  reply: MessageCircleIcon,
  check_in: SunriseIcon,
  reminder: AlarmClockIcon,
  relay: ArrowLeftRightIcon,
  confirm: CircleCheckIcon,
  memory: BrainIcon,
  file: FileTextIcon,
  reading: EyeIcon,
  context: LayersIcon,
  thinking: SparklesIcon,
  tool: WrenchIcon,
  writing: PenLineIcon,
  step: CircleIcon,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
}

const timeLabel = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useNow(on: boolean, ms = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [on, ms]);
  return now;
}

const STATUS_WORD: Record<Exclude<TiboActivity["status"], "running" | "done">, string> = {
  failed: "Didn't finish",
  skipped: "Skipped",
};

function StatusIcon({ activity, className }: { activity: TiboActivity; className?: string }) {
  if (activity.status === "running") return <Spinner className={cn("text-tibo-live", className)} />;
  const Icon = activity.status === "done" ? CircleCheckIcon : activity.status === "failed" ? CircleXIcon : CircleSlashIcon;
  return (
    <Icon
      aria-label={activity.status === "done" ? "Done" : STATUS_WORD[activity.status]}
      className={cn(
        activity.status === "done" ? "text-success" : activity.status === "failed" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    />
  );
}

function NowIcon({ current }: { current: TiboActivity | null }) {
  const Icon = current ? KIND_ICON[current.kind] : CoffeeIcon;
  return (
    <span
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-xl",
        current ? "bg-tibo-live/15 text-tibo-live" : "bg-tibo-soft text-tibo-foreground",
      )}
    >
      {current && (
        <span aria-hidden="true" className="absolute inset-0 animate-pulse rounded-xl ring-2 ring-tibo-live/40 motion-reduce:hidden" />
      )}
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

function Overview({ showActivity }: { showActivity: () => void }) {
  const { current, thread } = useCurrentActivity();
  const last = useLastActivity();
  const now = useNow(true, current ? 1000 : 30_000);
  const { threads, status } = useActivityLog();
  const recent = threads.filter((entry) => entry.status !== "running").slice(0, 4);
  const lastDone = last ?? recent[0] ?? null;
  const loadingRecent = status === "loading" && recent.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="What Tibo is doing" className="rounded-2xl border border-tibo-side-border bg-tibo-now p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <NowIcon current={current} />
          <div className="min-w-0 flex-1" aria-live="polite">
            {current ? (
              <>
                <p className="text-lg leading-snug font-semibold text-balance">
                  {current.label}
                  <span aria-hidden="true" className="tibo-ellipsis" />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {thread && thread.id !== current.id ? `${thread.label}, ` : ""}
                  for {formatDuration(now - current.startedAt)}
                </p>
                {current.detail && <p className="mt-1 text-sm text-foreground/80">{current.detail}</p>}
              </>
            ) : (
              <>
                <p className="text-lg leading-snug font-semibold">All ears</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {lastDone
                    ? `Nothing on my plate. Last busy ${ago(lastDone.endedAt ?? lastDone.startedAt, now)}, ${lastDone.label.charAt(0).toLowerCase()}${lastDone.label.slice(1)}.`
                    : "Nothing on my plate yet. Send me something and watch me go."}
                </p>
              </>
            )}
          </div>
        </div>
        {thread && thread.steps.length > 0 && (
          <ol aria-label="Steps so far" className="mt-4 flex flex-col gap-1.5 border-t border-tibo-side-border pt-3">
            {thread.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm">
                <StatusIcon activity={step} className="size-3.5 shrink-0" />
                <span className={cn("min-w-0 flex-1 truncate", step.status === "running" ? "font-medium" : "text-muted-foreground")}>
                  {step.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDuration((step.endedAt ?? now) - step.startedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {loadingRecent && (
        <div aria-label="Loading recent activity" className="flex flex-col gap-3">
          <Bone className="h-4 w-20" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-2.5">
              <Bone className="size-4 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Bone className="h-3.5 w-3/5" />
                <Bone className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <section aria-labelledby="tibo-recent" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 id="tibo-recent" className="text-sm font-medium">
              Recently
            </h3>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={showActivity}>
              All activity
            </Button>
          </div>
          <ul className="flex flex-col">
            {recent.map((entry) => {
              const Icon = KIND_ICON[entry.kind];
              return (
                <li key={entry.id} className="flex items-start gap-2.5 py-1.5">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry.label}</p>
                    {entry.detail && <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>}
                  </div>
                  <time dateTime={new Date(entry.startedAt).toISOString()} className="shrink-0 text-xs text-muted-foreground">
                    {ago(entry.startedAt, now)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Media() {
  const { files, failed, retry } = useSentFiles();
  const [viewing, setViewing] = React.useState<TiboSentFile | null>(null);
  if (files === null && failed) return <LoadFailed what="your files" retry={retry} />;
  if (files === null) {
    return (
      <div aria-label="Loading your files" className="flex flex-col gap-3">
        <Bone className="h-4 w-16" />
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((tile) => (
            <Bone key={tile} className="aspect-square rounded-lg" />
          ))}
        </div>
        <Bone className="mt-3 h-4 w-12" />
        {[0, 1].map((row) => (
          <div key={row} className="flex items-center gap-2.5">
            <Bone className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bone className="h-3.5 w-3/5" />
              <Bone className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const photos = files.filter((file) => file.kind === "image");
  const others = files.filter((file) => file.kind !== "image");
  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Photos and files you send Tibo show up here. Tap + in the message box to add some.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {photos.length > 0 && (
        <section aria-labelledby="tibo-photos" className="flex flex-col gap-2">
          <h3 id="tibo-photos" className="text-sm font-medium">
            Photos <span className="font-normal text-muted-foreground">{photos.length}</span>
          </h3>
          <ul className="grid grid-cols-3 gap-1">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setViewing(photo)}
                  aria-label={`Open ${photo.name}`}
                  className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  <img
                    src={tiboFileUrl(photo.id)}
                    alt={photo.name}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="tibo-files" className="flex flex-col gap-2">
          <h3 id="tibo-files" className="text-sm font-medium">
            Files <span className="font-normal text-muted-foreground">{others.length}</span>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {others.map((file) => (
              <li key={file.id}>
                <FileCard file={file} mine={false} />
                <p className="mt-0.5 px-1 text-xs text-muted-foreground">
                  Sent {new Date(file.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

const dayLabel = (at: number) => {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};

function ActivityLog() {
  const { threads, status, hasMore, loadOlder, retry } = useActivityLog();
  const running = threads.some((thread) => thread.status === "running");
  const now = useNow(running);
  if (status === "loading" && threads.length === 0) {
    return (
      <div aria-label="Loading Tibo's activity" className="flex flex-col gap-5">
        <Bone className="h-3 w-12" />
        {[3, 2, 4].map((steps, thread) => (
          <div key={thread} className="flex gap-3">
            <Bone className="size-8 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bone className="h-3.5 w-1/2" />
              <Bone className="h-3 w-1/3" />
              <div className="mt-1.5 flex flex-col gap-2 border-l border-tibo-side-border pl-3">
                {Array.from({ length: steps }, (_, step) => (
                  <Bone key={step} className={cn("h-3", step % 2 === 0 ? "w-3/5" : "w-2/5")} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (status === "failed" && threads.length === 0) return <LoadFailed what="Tibo's activity" retry={retry} />;
  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet. Everything Tibo does for you shows up here.</p>;
  }
  const days: { day: string; threads: TiboActivityThread[] }[] = [];
  for (const thread of threads) {
    const day = dayLabel(thread.startedAt);
    const last = days.at(-1);
    if (last?.day === day) last.threads.push(thread);
    else days.push({ day, threads: [thread] });
  }
  return (
    <div className="flex flex-col gap-5">
      {days.map(({ day, threads: dayThreads }) => (
        <section key={day} aria-label={day} className="flex flex-col gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">{day}</h3>
          <ol className="flex flex-col gap-4">
            {dayThreads.map((thread) => (
              <ActivityThreadView key={thread.id} thread={thread} now={now} />
            ))}
          </ol>
        </section>
      ))}
      {hasMore && (
        <Button variant="outline" size="sm" className="self-center" onClick={loadOlder}>
          Show older
        </Button>
      )}
    </div>
  );
}

function ActivityThreadView({ thread, now }: { thread: TiboActivityThread; now: number }) {
  const Icon = KIND_ICON[thread.kind];
  const took = (thread.endedAt ?? now) - thread.startedAt;
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          thread.status === "running" ? "bg-tibo-live/15 text-tibo-live" : "bg-tibo-soft text-tibo-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium">{thread.label}</p>
          <time dateTime={new Date(thread.startedAt).toISOString()} className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {timeLabel(thread.startedAt)}
          </time>
        </div>
        <p className="text-xs text-muted-foreground">
          {thread.status === "running"
            ? `Working, ${formatDuration(took)} so far`
            : thread.status === "done"
              ? `Took ${formatDuration(took)}`
              : STATUS_WORD[thread.status]}
          {thread.detail ? `. ${thread.detail}` : ""}
        </p>
        {thread.steps.length > 0 && (
          <ol className="mt-2 flex flex-col gap-1.5 border-l border-tibo-side-border pl-3">
            {thread.steps.map((step) => (
              <li key={step.id} className="relative flex flex-col">
                <StatusIcon
                  activity={step}
                  className="absolute top-0.5 -left-[1.2rem] size-3 rounded-full bg-bubble-tibo"
                />
                <div className="flex items-baseline gap-2 text-sm">
                  <span className={cn("min-w-0 flex-1", step.status === "running" && "font-medium")}>{step.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDuration((step.endedAt ?? now) - step.startedAt)}
                  </span>
                </div>
                {step.detail && <p className="text-xs break-words text-muted-foreground">{step.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </li>
  );
}
