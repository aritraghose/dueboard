import {
  PRIVACY,
  RELAY_POLICY,
  type Privacy,
  type RelayPolicy,
  type SettingsPatch,
} from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Exit from "effect/Exit";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resetLine, useAiUsage, usageLine } from "@/hooks/use-ai-usage";
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import { useUpdateSettings } from "@/hooks/use-settings";
import { socialOverviewAtom, useSocialActions } from "@/hooks/use-social";
import { failureMessage, useRun } from "@/hooks/use-tasks";
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

const RELAY_OPTIONS: readonly { value: RelayPolicy; label: string }[] = RELAY_POLICY.map((value) => ({
  value,
  label: { connections: "My connections", anyone: "Anyone", none: "No one" }[value],
}));

function Tibo() {
  const settings = useBootstrap()?.settings;
  const { save } = useSaveSetting();
  const [policy, setPolicy] = useState<RelayPolicy | null>(null);

  return (
    <Panel>
      <AiUsageRow />
      <Row
        id="relay-policy"
        title="Messages through Tibo"
        description="Who can pass you a message through their Tibo."
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
  );
}

/** This month's AI messages: replies, check-ins, relays and Ask answers all count. */
function AiUsageRow() {
  const { usage, failed } = useAiUsage();
  // The server render can't reach `/rpc`; only a failure in the browser is real.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Row title="Messages this month">
      {usage ? (
        <div className="flex w-full flex-col gap-2 text-sm">
          <div
            role="meter"
            aria-label="AI messages used"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={usage.used}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-tibo"
              style={{ width: `${usage.limit > 0 ? (usage.used / usage.limit) * 100 : 100}%` }}
            />
          </div>
          <p>{usageLine(usage)}</p>
          <p className="text-xs text-muted-foreground">{resetLine(usage)}</p>
        </div>
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
