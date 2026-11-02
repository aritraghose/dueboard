import { createFileRoute } from "@tanstack/react-router";
import { ChevronDownIcon, PanelRightOpenIcon, RepeatIcon, TargetIcon, TimerIcon } from "lucide-react";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DayStepper, NowClock } from "@/components/day-navigator";
import { LiveCard } from "@/components/live-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { type LocalDate, formatDay, isLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type NowSearch = {
  /** The selected day. Absent means today in the user's time zone. */
  date?: LocalDate | undefined;
};

/**
 * Where users land after signing in: one day at a time. The day lives in
 * `?date=YYYY-MM-DD`; anything else in that param is dropped. Two cards: the
 * day (tasks, then at its bottom the Settled / Sessions / Unscheduled and
 * the habits and goals tab rows, each with a fold chevron) takes two thirds, Live (with a note box) one third,
 * and the day card takes it all when Live is collapsed. Their contents are
 * placeholders until their build steps (tasks 4, habits 6, goals 8, sessions
 * 11, Live 14) fill them.
 */
export const Route = createFileRoute("/_app/now")({
  // `date` is always set, even to `undefined`: the router merges this over
  // the raw search, so leaving the key out would let an invalid date through.
  validateSearch: (search: Record<string, unknown>): NowSearch => ({
    date: typeof search.date === "string" && isLocalDate(search.date) ? search.date : undefined,
  }),
  head: () => ({ meta: [{ title: "Now · Dueboard" }] }),
  staticData: { topBar: { start: StartSessionButton, center: TopBarClock } },
  component: Now,
});

/**
 * In the top row: start a focus session, on a cream pill. Once sessions
 * exist (step 11), a running session's countdown takes this button's place.
 */
function StartSessionButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full bg-cream text-cream-foreground ring-1 ring-cream-foreground/10 hover:bg-cream/80! hover:text-cream-foreground! dark:ring-0"
      onClick={() => toast("Focus sessions are on the way.")}
    >
      <TimerIcon />
      <span className="md:hidden">Start</span>
      <span className="max-md:hidden">Start a session</span>
    </Button>
  );
}

/** In the top row's center: today's date and the local time. */
function TopBarClock() {
  const timeZone = useTimeZone();
  return <NowClock today={useToday(timeZone)} timeZone={timeZone} />;
}

function Now() {
  const { date: searchDate } = Route.useSearch();
  const navigate = Route.useNavigate();
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const date = searchDate ?? today;
  const [liveCollapsed, setLiveCollapsed] = useLiveCollapsed();

  const changeDate = useCallback(
    (next: LocalDate) => {
      // Today keeps a clean `/now`, so a bookmark always opens on the current day.
      void navigate({ search: { date: next === today ? undefined : next }, replace: true });
    },
    [navigate, today],
  );

  // "today" or "on Wed, Nov 4", to finish a sentence.
  const onDay = !date || date === today ? "today" : `on ${formatDay(date, today ?? undefined)}`;

  // Phones show the day and Live as two tabs. From `md` up both cards sit
  // side by side (two thirds and one third) and the tabs hide; a collapsed
  // Live gives the day card the full width. The page is exactly one screen
  // tall, so the day card's tab rows sit at its bottom without scrolling.
  return (
    <main className="flex h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] min-h-96 flex-col md:h-[calc(100dvh-3.375rem)]">
      <Tabs
        defaultValue="day"
        className={cn(
          // One stacking layer for both panes, so both glows sit under both cards.
          "isolate min-h-0 flex-1 gap-1.5 md:grid md:grid-rows-1 md:gap-1.5",
          liveCollapsed ? "md:grid-cols-1" : "md:grid-cols-3",
        )}
      >
        <TabsList className="w-full md:hidden">
          <TabsTrigger value="day">Tasks</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>

        <TabsContent value="day" forceMount className={cn(paneClass, !liveCollapsed && "md:col-span-2")}>
          <CardGlow />
          <Card className={cardClass}>
            <CardHeader className="grid grid-cols-[1fr_auto_1fr] items-start border-b">
              <span />
              <DayStepper date={date} today={today} onChange={changeDate} />
              {liveCollapsed && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end max-md:hidden"
                  aria-label="Show Live"
                  onClick={() => setLiveCollapsed(false)}
                >
                  <PanelRightOpenIcon />
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <section aria-label="Tasks" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-muted-foreground">
                  Nothing due {onDay}.
                </p>
              </section>

              <DayTabs
                label="settled, sessions and unscheduled"
                tabs={[
                  {
                    value: "settled",
                    label: <Counted label="Settled" count={0} />,
                    content: `Tasks you settle ${onDay} move here.`,
                  },
                  {
                    value: "sessions",
                    label: <Counted label="Sessions" count={0} />,
                    content: `Focus sessions from ${onDay} show here.`,
                  },
                  {
                    value: "unscheduled",
                    label: <Counted label="Unscheduled" count={0} />,
                    content: "Tasks without a date wait here until you give them one.",
                  },
                ]}
              />

              <DayTabs
                label="habits and goals"
                tabs={[
                  {
                    value: "habits",
                    label: (
                      <>
                        <RepeatIcon />
                        No habits due
                      </>
                    ),
                    content: `Habits due ${onDay} show here, and the ones you've checked.`,
                  },
                  {
                    value: "goals",
                    label: (
                      <>
                        <TargetIcon />
                        No active goals
                      </>
                    ),
                    content: "Your active goals show here every day, with how far along they are.",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="live"
          forceMount
          className={cn(
            "relative flex min-h-0 flex-col data-[state=inactive]:hidden",
            liveCollapsed ? "md:hidden" : "md:data-[state=inactive]:flex",
          )}
        >
          <CardGlow />
          <LiveCard className={cardClass} onCollapse={() => setLiveCollapsed(true)} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

// Both panes stay mounted: on phones the inactive one is hidden; from `md`
// up both show. Each card fills its pane's full height.
const paneClass =
  "relative flex min-h-0 flex-col data-[state=inactive]:hidden md:data-[state=inactive]:flex";
const cardClass =
  "min-h-0 flex-1 rounded-2xl [--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]";

/**
 * A soft gradient shadow under a card (`--card-glow`), in both themes. It
 * stacks in the panes' shared layer (`isolate` on the tabs), under both
 * cards, so one card's glow never paints over the other card.
 */
function CardGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-1.5 top-6 -bottom-3 -z-10 rounded-3xl bg-(image:--card-glow) blur-xl"
    />
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/** A tab label with its count. */
function Counted({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.6875rem] tabular-nums sm:h-4.5 sm:min-w-4.5 sm:text-xs">
        {count}
      </Badge>
    </>
  );
}

type DayTab = {
  readonly value: string;
  /** The tab's title. For habits and goals it's the status itself. */
  readonly label: ReactNode;
  readonly content: ReactNode;
  /** A done status ("All habits checked") reads in green. */
  readonly done?: boolean;
};

/**
 * A row of tabs in the day card, with its own fold chevron beside it. The
 * tabs only switch what shows; the chevron alone folds and unfolds. Both
 * rows start folded.
 */
function DayTabs({
  label,
  tabs,
  defaultOpen = false,
}: {
  label: string;
  tabs: readonly DayTab[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState(tabs[0]?.value ?? "");
  const contentId = useId();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Tabs value={tab} onValueChange={setTab} className="gap-2" aria-label={label}>
        <div className="flex items-center gap-1">
          <TabsList className="min-w-0">
            {tabs.map(({ value, label: title, done }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "gap-1 px-1.5 text-[0.8125rem] sm:gap-1.5 sm:px-3 sm:text-sm",
                  done && "text-success data-active:text-success dark:text-success",
                )}
              >
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-controls={contentId}
              aria-label={open ? `Hide ${label}` : `Show ${label}`}
            >
              <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent id={contentId}>
          {tabs.map(({ value, content }) => (
            <TabsContent key={value} value={value}>
              <Placeholder>{content}</Placeholder>
            </TabsContent>
          ))}
        </CollapsibleContent>
      </Tabs>
    </Collapsible>
  );
}

const LIVE_COLLAPSED_KEY = "dueboard-live-collapsed";

/**
 * Whether Live is collapsed on wide screens, remembered per viewer in
 * localStorage. Read after mount, so the server render and hydration agree.
 */
function useLiveCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LIVE_COLLAPSED_KEY) === "true");
    } catch {
      // Storage blocked (private mode, site data off): start expanded.
    }
  }, []);
  const update = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(LIVE_COLLAPSED_KEY, String(next));
    } catch {
      // Not remembered this time; the toggle still works.
    }
  };
  return [collapsed, update] as const;
}
