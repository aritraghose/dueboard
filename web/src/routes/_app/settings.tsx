import {
  PRIVACY,
  RELAY_POLICY,
  TIBO_DEADLINE_NUDGE_TIME,
  TIBO_EVENING_TIMES,
  TIBO_MORNING_TIMES,
  type AiUsage,
  type Privacy,
  type RelayPolicy,
  type Settings as UserSettings,
  type SettingsPatch,
} from "@dueboard/api/rpc";
import type { TiboMemory, TiboMemoryKind } from "@dueboard/api/tibo";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Exit from "effect/Exit";
import {
  CalendarCheck2,
  CalendarClock,
  Heart,
  Info,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/page";
import { PeopleList, PeopleLoadFailed, statusOf } from "@/components/people-lists";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resetLine, useAiUsage } from "@/hooks/use-ai-usage";
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import { useUpdateSettings } from "@/hooks/use-settings";
import { socialOverviewAtom, useSocialActions } from "@/hooks/use-social";
import { failureMessage, useRun } from "@/hooks/use-tasks";
import { useTiboMemories } from "@/hooks/use-tibo-memories";
import { PRIVACY_ICON } from "@/lib/notes";
import { PRIVACY_LABEL } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { authClient } from "../../auth-client.ts";
import { ApiClient } from "../../rpc-client.ts";

const TABS = [
  { value: "general", label: "General" },
  { value: "connections", label: "Connections" },
  { value: "tibo", label: "Tibo" },
  { value: "account", label: "Account" },
] as const;
type SettingsTab = (typeof TABS)[number]["value"];

type SettingsSearch = { tab?: Exclude<SettingsTab, "general"> | undefined };

export const Route = createFileRoute("/_app/settings")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: TABS.some(({ value }) => value !== "general" && value === search.tab)
      ? (search.tab as SettingsSearch["tab"])
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Settings · Dueboard" }] }),
  component: Settings,
});

function Settings() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <Page>
      <PageHeader title="Settings" />
      <Tabs
        value={tab ?? "general"}
        onValueChange={(value) =>
          void navigate({
            search: { tab: value === "general" ? undefined : (value as SettingsSearch["tab"]) },
            replace: true,
          })
        }
        className="w-full gap-5 pb-8 md:flex-row! md:items-start md:gap-8"
      >
        {/* A row of tabs on phones; a column beside the panel from `md` up. */}
        <TabsList className="max-md:w-full md:sticky md:top-4 md:h-auto! md:w-44 md:shrink-0 md:flex-col md:items-stretch md:gap-0.5">
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="md:h-8 md:flex-none md:justify-start md:px-2.5">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <General />
        </TabsContent>
        <TabsContent value="connections">
          <Connections />
        </TabsContent>
        <TabsContent value="tibo">
          <Tibo />
        </TabsContent>
        <TabsContent value="account">
          <Account />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

/** One card of settings rows. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col divide-y rounded-xl border bg-card px-5 shadow-(--card-shadow)", className)}>
      {children}
    </div>
  );
}

/**
 * A setting: its name and what it does, then its control. `inline` keeps a
 * small control (a switch, a value, a button) beside the name at every
 * size. Otherwise the control fills the width below the name on phones and
 * takes a fixed column on the right from `md` up.
 */
function Row({
  title,
  description,
  children,
  id,
  inline = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  inline?: boolean;
}) {
  const label = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-4 py-4">
        {label}
        <div className="shrink-0">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 py-4 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:gap-x-10">
      {label}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A choice shown as stacked options (with an optional hint): a radio group, so
 * the arrow keys move between them. Picking one saves at once.
 */
function Choice<T extends string>({
  labelledBy,
  options,
  value,
  onChange,
  disabled,
}: {
  labelledBy: string;
  options: readonly { value: T; label: string; hint?: string; icon?: React.ComponentType<{ className?: string }> }[];
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const move = (from: number, step: number) => {
    const next = options[(from + step + options.length) % options.length]!;
    onChange(next.value);
    document.getElementById(`${labelledBy}-${next.value}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex w-full flex-col gap-1.5">
      {options.map((option, index) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            id={`${labelledBy}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (value === undefined && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => !checked && onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              checked ? "border-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                checked ? "border-primary" : "border-input",
              )}
            >
              {checked && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {Icon && <Icon className="size-3.5 text-muted-foreground" />}
                {option.label}
              </span>
              {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Saves one settings change, showing it at once and toasting a failure. */
function useSaveSetting() {
  const update = useUpdateSettings();
  const [saving, setSaving] = useState(false);
  const save = async (patch: SettingsPatch, what: string) => {
    setSaving(true);
    const exit = await update(patch);
    setSaving(false);
    if (Exit.isFailure(exit)) toast.error(failureMessage(exit, `Couldn't save ${what}.`));
    return exit;
  };
  return { save, saving };
}

// ─── General ─────────────────────────────────────────────────────────────────

const PRIVACY_OPTIONS = PRIVACY.map((value) => ({
  value,
  label: PRIVACY_LABEL[value],
  icon: PRIVACY_ICON[value],
}));

function General() {
  const settings = useBootstrap()?.settings;
  const timeZone = useTimeZone();
  const { save, saving } = useSaveSetting();
  // The pick shows at once; the saved settings take over when they arrive.
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [share, setShare] = useState<boolean | null>(null);
  const shownPrivacy = privacy ?? settings?.defaultPrivacy;
  const shownShare = share ?? settings?.defaultShareToLive;

  return (
    <Panel>
      <Row
        id="default-privacy"
        title="Who sees new items"
        description="You can change each item later."
      >
        <Choice
          labelledBy="default-privacy"
          options={PRIVACY_OPTIONS}
          value={shownPrivacy}
          disabled={!settings}
          onChange={(value) => {
            setPrivacy(value);
            void save({ defaultPrivacy: value }, "who sees new items").then(() => setPrivacy(null));
          }}
        />
      </Row>
      <Row
        inline
        title="Share new items to Live"
        description="Private items show without details."
      >
        <div className="flex items-center gap-2.5">
          <Label htmlFor="default-share" className="text-sm text-muted-foreground max-sm:sr-only">
            {(shownShare ?? true) ? "On Live" : "Off Live"}
          </Label>
          <Switch
            id="default-share"
            checked={shownShare ?? true}
            disabled={!settings || saving}
            onCheckedChange={(checked) => {
              setShare(checked);
              void save({ defaultShareToLive: checked }, "the Live default").then(() => setShare(null));
            }}
          />
        </div>
      </Row>
      <Row inline title="Time zone" description="Follows your device.">
        <p className="font-medium">{timeZone.replaceAll("_", " ")}</p>
      </Row>
      <Row inline title="Theme">
        <ThemeSwitcher />
      </Row>
    </Panel>
  );
}

// ─── Connections ─────────────────────────────────────────────────────────────

/** Only the blocked list lives here; connections (`/connections`) and requests (`/discover`) have their own pages. */
function Connections() {
  const result = useAtomValue(socialOverviewAtom);
  const { reload } = useSocialActions();
  const data = AsyncResult.isSuccess(result) ? result.value : undefined;

  return (
    <Panel>
      <Row
        title="Blocked accounts"
        description="Accounts you block appear here."
      >
        <div className="w-full">
          {AsyncResult.isFailure(result) && !data ? (
            <PeopleLoadFailed what="the people you blocked" onRetry={() => void reload()} />
          ) : (
            <PeopleList
              people={data?.blocked.map((blocked) => ({
                key: blocked.person.username,
                person: blocked.person,
                status: statusOf("blocked"),
              }))}
              empty="You haven't blocked anyone."
            />
          )}
        </div>
      </Row>
    </Panel>
  );
}

// ─── Tibo ────────────────────────────────────────────────────────────────────

const RELAY_OPTIONS: readonly { value: RelayPolicy; label: string; hint: string }[] = RELAY_POLICY.map((value) => ({
  value,
  label: { connections: "My connections", anyone: "Anyone", none: "No one" }[value],
  hint: {
    connections: "People you're connected with.",
    anyone: "Anyone on Dueboard who knows your username.",
    none: "Tibo turns every message away.",
  }[value],
}));

function Tibo() {
  const settings = useBootstrap()?.settings;
  const { save } = useSaveSetting();
  const [policy, setPolicy] = useState<RelayPolicy | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <AiUsageRow />
        <Row
          id="relay-policy"
          title="Messages through Tibo"
          description="Who can ask their Tibo to pass you a message. Your Tibo tells you in chat and passes back only what you tell it to answer. Each message and its answer use half a message from each of you. Blocking someone closes their messages."
        >
          <Choice
            labelledBy="relay-policy"
            options={RELAY_OPTIONS}
            value={policy ?? settings?.relayPolicy}
            disabled={!settings}
            onChange={(value) => {
              setPolicy(value);
              void save({ relayPolicy: value }, "who can message you").then(() => setPolicy(null));
            }}
          />
        </Row>
      </Panel>
      <TiboCheckIns />
      <TiboMemories />
    </div>
  );
}

// ─── Tibo → Check-ins ────────────────────────────────────────────────────────

type CheckInSettings = Pick<
  UserSettings,
  | "tiboProactive"
  | "tiboMorningPlan"
  | "tiboMorningTime"
  | "tiboDeadlineNudges"
  | "tiboHabitCheck"
  | "tiboEveningTime"
>;

/** "8:00 AM" (or "08:00" where clocks run to 24) from `HH:MM`. */
const clockLabel = (time: string, short = false) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    ...(short && minutes === 0 ? {} : { minute: "2-digit" }),
  }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
};

/**
 * When Tibo messages first: the master switch, the day strip, then each
 * kind. Every change saves at once and shows before the save answers;
 * the agent re-plans its alarms within a minute.
 */
function TiboCheckIns() {
  const settings = useBootstrap()?.settings;
  const { save } = useSaveSetting();
  // Picks not saved yet, over the saved settings.
  const [picked, setPicked] = useState<Partial<CheckInSettings>>({});
  const shown: CheckInSettings | undefined = settings && { ...settings, ...picked };
  const on = shown?.tiboProactive ?? false;

  const change = <K extends keyof CheckInSettings>(key: K, value: CheckInSettings[K], what: string) => {
    setPicked((current) => ({ ...current, [key]: value }));
    void save({ [key]: value } as SettingsPatch, what).then(() =>
      setPicked(({ [key]: _saved, ...rest }) => rest as Partial<CheckInSettings>),
    );
  };

  const kindSwitch = (key: "tiboMorningPlan" | "tiboDeadlineNudges" | "tiboHabitCheck", label: string) => (
    <Switch
      aria-label={label}
      checked={shown?.[key] ?? false}
      disabled={!shown || !on}
      onCheckedChange={(checked) => change(key, checked, label.toLowerCase())}
    />
  );

  const timeSelect = (key: "tiboMorningTime" | "tiboEveningTime", times: readonly string[], label: string, enabled: boolean) => (
    <Select
      value={shown?.[key]}
      disabled={!shown || !on || !enabled}
      onValueChange={(value) => change(key, value as CheckInSettings[typeof key], label.toLowerCase())}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-28 tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {times.map((time) => (
          <SelectItem key={time} value={time} className="tabular-nums">
            {clockLabel(time)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Panel>
      <div className="flex flex-col gap-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-medium">Tibo messages you first</h2>
            <p className="text-sm text-muted-foreground">
              A few short check-ins a day, never while you're chatting. Each one counts as a request.
            </p>
          </div>
          <Switch
            aria-label="Tibo messages you first"
            checked={on}
            disabled={!shown}
            onCheckedChange={(checked) => change("tiboProactive", checked, "check-ins")}
          />
        </div>
        {shown && on && <CheckInDay settings={shown} />}
      </div>
      <div className={cn("flex flex-col divide-y transition-opacity", !on && "opacity-55")}>
        <CheckInRow
          title="Morning plan"
          description="Your day, planned from your board."
          time={timeSelect("tiboMorningTime", TIBO_MORNING_TIMES, "Morning plan time", shown?.tiboMorningPlan ?? false)}
          toggle={kindSwitch("tiboMorningPlan", "Morning plan")}
        />
        <CheckInRow
          title="Deadline nudge"
          description={`At ${clockLabel(TIBO_DEADLINE_NUDGE_TIME)}, if something due today is still open.`}
          toggle={kindSwitch("tiboDeadlineNudges", "Deadline nudge")}
        />
        <CheckInRow
          title="Evening habit check"
          description="If habits are still due."
          time={timeSelect("tiboEveningTime", TIBO_EVENING_TIMES, "Evening habit check time", shown?.tiboHabitCheck ?? false)}
          toggle={kindSwitch("tiboHabitCheck", "Evening habit check")}
        />
      </div>
    </Panel>
  );
}

/**
 * One kind: its name and when, its time (if it has one), then its switch
 * on the right. On phones the time drops under the description, so the
 * name keeps the width.
 */
function CheckInRow({
  title,
  description,
  time,
  toggle,
}: {
  title: string;
  description: string;
  time?: ReactNode;
  toggle: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {time && <div className="max-sm:order-last max-sm:col-span-2">{time}</div>}
      <div className={cn("flex", !time && "sm:col-span-2 sm:justify-self-end")}>{toggle}</div>
    </div>
  );
}

// The strip's span: the waking day, 5 AM to midnight.
const DAY_START = 5;
const DAY_END = 24;
const hourOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours + minutes / 60;
};

/**
 * The day as a strip, with a mark at each time Tibo may write: the one
 * picture of the schedule, so the times read at a glance. The deadline's
 * label sits above the strip, the others below, so marks an hour apart
 * never collide.
 */
function CheckInDay({ settings }: { settings: CheckInSettings }) {
  const marks = [
    settings.tiboMorningPlan && { key: "morning", time: settings.tiboMorningTime, name: "morning plan", above: false },
    settings.tiboDeadlineNudges && { key: "deadline", time: TIBO_DEADLINE_NUDGE_TIME, name: "deadline nudge", above: true },
    settings.tiboHabitCheck && { key: "evening", time: settings.tiboEveningTime, name: "habit check", above: false },
  ].filter((mark) => mark !== false);
  const description =
    marks.length === 0
      ? "Every kind of check-in is off."
      : `Tibo may write at ${marks.map((mark) => `${clockLabel(mark.time)} (${mark.name})`).join(", ")}.`;

  if (marks.length === 0) return <p className="text-sm text-muted-foreground">{description}</p>;
  return (
    <div role="img" aria-label={description} className="relative h-14 select-none">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-check-in-track" />
      {marks.map((mark) => {
        const left = ((hourOf(mark.time) - DAY_START) / (DAY_END - DAY_START)) * 100;
        return (
          <div
            key={mark.key}
            aria-hidden="true"
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-[left] duration-300 motion-reduce:transition-none"
            style={{ left: `clamp(1.25rem, ${left}%, calc(100% - 1.25rem))` }}
          >
            <span
              className={cn(
                "absolute left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground tabular-nums",
                mark.above ? "bottom-4" : "top-4",
              )}
            >
              {clockLabel(mark.time, true)}
            </span>
            <span className="size-3 rounded-full bg-check-in-mark ring-3 ring-card" />
          </div>
        );
      })}
    </div>
  );
}

const MEMORY_KIND: Record<TiboMemoryKind, { label: string; icon: LucideIcon }> = {
  fact: { label: "Fact", icon: Info },
  preference: { label: "Preference", icon: Heart },
  person: { label: "Person", icon: UserRound },
  event: { label: "Event", icon: CalendarCheck2 },
  plan: { label: "Plan", icon: CalendarClock },
};

/** Memories shown before "Show all". */
const MEMORIES_SHOWN = 20;

/**
 * What Tibo remembers about you: the lasting facts it picked up from your
 * chats (or was asked to keep), newest first, each with its kind and when
 * it was learned. Deleting one takes it out of Tibo's memory at once.
 */
function TiboMemories() {
  const { state, remove } = useTiboMemories();
  const [showAll, setShowAll] = useState(false);
  const memories = state.status === "ready" ? state.memories : [];
  const shown = showAll ? memories : memories.slice(0, MEMORIES_SHOWN);

  const forget = async (memory: TiboMemory) => {
    if (!(await remove(memory))) toast.error("Couldn't delete that memory. Try again.");
  };

  return (
    <Panel>
      <div className="flex flex-col gap-0.5 py-4">
        <h2 id="tibo-memories" className="font-medium">
          What Tibo remembers
        </h2>
        <p className="text-sm text-muted-foreground">
          Things Tibo picked up from your chats. Delete any you'd rather it forgot.
        </p>
      </div>
      {state.status !== "ready" ? (
        <p className="py-4 text-sm text-muted-foreground">
          {state.status === "loading" ? "Loading…" : "Couldn't load what Tibo remembers. Reload to try again."}
        </p>
      ) : memories.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nothing yet. Tibo keeps what matters as you chat, or say “remember that…”.
        </p>
      ) : (
        <ul aria-labelledby="tibo-memories" className="flex flex-col divide-y">
          {shown.map((memory) => {
            const { label, icon: Icon } = MEMORY_KIND[memory.kind];
            return (
              <li key={memory.id} className="flex items-start gap-3 py-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">{label}:</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <p className="min-w-0 flex-1 text-sm">{memory.text}</p>
                  <p className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    Since{" "}
                    {new Date(memory.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-my-1 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete memory: ${memory.text}`}
                  onClick={() => void forget(memory)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!showAll && memories.length > MEMORIES_SHOWN && (
        <div className="py-2">
          <Button variant="ghost" size="sm" className="-mx-2.5" onClick={() => setShowAll(true)}>
            Show all {memories.length}
          </Button>
        </div>
      )}
    </Panel>
  );
}

// The knob's width, in px: the bar runs from its center at 0% to its
// center at 100%, so it never hangs past the track.
const KNOB = 14;

/**
 * How much of this month's Tibo requests you've used: a percentage and a
 * bar that fills toward 100%, with a knob at its end. Deep teal, orange
 * from 80%, red once they're all used. Hovering or tapping the bar shows
 * how many are left.
 */
function UsageMeter({ usage }: { usage: AiUsage }) {
  const { used, remaining, limit } = usage;
  const share = limit > 0 ? Math.min(used / limit, 1) : 1;
  const tone = remaining === 0 ? "empty" : share >= 0.8 ? "low" : "ok";
  // Under 1% still reads as some use, not none.
  const percent = used > 0 && share < 0.01 ? "<1" : String(Math.round(share * 100));
  const left = `${remaining} of ${limit} ${limit === 1 ? "request" : "requests"} left`;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground">
          <span
            className={cn(
              "mr-1 text-2xl font-semibold text-foreground tabular-nums",
              tone === "low" && "text-usage-low",
              tone === "empty" && "text-usage-empty",
            )}
          >
            {percent}%
          </span>
          used
        </p>
        <p className="text-xs text-muted-foreground">{resetLine(usage)}</p>
      </div>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${percent}% of Tibo requests used, ${left}`}
            // A tap toggles the count too (a tooltip alone only opens on hover).
            onClick={(event) => {
              event.preventDefault();
              setOpen((was) => !was);
            }}
            className="group/usage -my-1 block w-full rounded-full py-1 outline-none"
          >
            <div
              role="meter"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={used}
              aria-valuetext={`${percent}% used, ${left}`}
              className="relative h-2 rounded-full bg-usage-track"
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-usage transition-[width]",
                  tone === "low" && "bg-usage-low",
                  tone === "empty" && "bg-usage-empty",
                )}
                style={{ width: `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${share})` }}
              />
              <div
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 -translate-1/2 rounded-full bg-usage transition-[left] group-focus-visible/usage:ring-3 group-focus-visible/usage:ring-ring/50",
                  tone === "low" && "bg-usage-low",
                  tone === "empty" && "bg-usage-empty",
                )}
                style={{
                  width: KNOB,
                  height: KNOB,
                  left: `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${share})`,
                }}
              />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent>{left}</TooltipContent>
      </Tooltip>
      {tone === "empty" && (
        <p className="text-xs text-usage-empty">
          You've used this month's requests. Tibo can reply again once they reset.
        </p>
      )}
    </div>
  );
}

/** This month's AI messages: replies, check-ins, relays and Ask answers all count. */
function AiUsageRow() {
  const { usage, failed } = useAiUsage();
  // The server render can't reach `/rpc`; only a failure in the browser is real.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Row title="Tibo Requests this month">
      {usage ? (
        <UsageMeter usage={usage} />
      ) : (
        <p className="text-sm text-muted-foreground">{failed && mounted ? "Couldn't load your usage." : "Loading…"}</p>
      )}
    </Row>
  );
}

// ─── Account ─────────────────────────────────────────────────────────────────

function Account() {
  const { user } = Route.useRouteContext();
  const [open, setOpen] = useState(false);

  return (
    <Panel>
      <Row
        inline
        title="Delete your account"
        description="Deletes everything. This can't be undone."
      >
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </Row>
      <DeleteAccountDialog username={user.username} open={open} onOpenChange={setOpen} />
    </Panel>
  );
}

function DeleteAccountDialog({
  username,
  open,
  onOpenChange,
}: {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const run = useRun();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();

  const remove = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    const exit = await run(
      ApiClient.use((client) => client("DeleteAccount", { confirmUsername: typed })),
    );
    if (Exit.isFailure(exit)) {
      setDeleting(false);
      setError(failureMessage(exit, "Couldn't delete your account."));
      return;
    }
    // The account is gone; signing out clears the session cookies (and the
    // cached copy the route guards read), then a full load starts fresh.
    await authClient.signOut().catch(() => undefined);
    window.location.assign("/");
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
        if (!next) {
          setTyped("");
          setError(null);
        }
      }}
    >
      <AlertDialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything you've added is deleted for good. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-username">Type {username} to confirm</Label>
            <Input
              id="confirm-username"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={deleting}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={deleting}>
              Keep my account
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!matches || deleting}>
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
