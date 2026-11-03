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
import { useState, type ReactNode } from "react";
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
import { useBootstrap, useTimeZone } from "@/hooks/use-bootstrap";
import { useUpdateSettings } from "@/hooks/use-settings";
import { socialOverviewAtom, useSocialActions } from "@/hooks/use-social";
import { failureMessage, useRun } from "@/hooks/use-tasks";
import { PRIVACY_ICON } from "@/lib/notes";
import { PRIVACY_HINT, PRIVACY_LABEL } from "@/lib/privacy";
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
      <PageHeader title="Settings" description="How Dueboard works for you." />
      <Tabs
        value={tab ?? "general"}
        onValueChange={(value) =>
          void navigate({
            search: { tab: value === "general" ? undefined : (value as SettingsSearch["tab"]) },
            replace: true,
          })
        }
        className="w-full max-w-3xl gap-5 pb-8"
      >
        <TabsList>
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
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

/** A setting: its name and what it does on the left, the control on the right (below it on phones, still on the right). */
function Row({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="grid gap-x-8 gap-y-3 py-5 sm:grid-cols-[minmax(0,13rem)_1fr]">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 justify-self-end">{children}</div>
    </div>
  );
}

/**
 * A choice shown as stacked options, each with its hint: a radio group, so
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
  options: readonly { value: T; label: string; hint: string; icon?: React.ComponentType<{ className?: string }> }[];
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
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex w-full flex-col gap-1.5 sm:w-80">
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
              <span className="text-xs text-muted-foreground">{option.hint}</span>
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
  hint: PRIVACY_HINT[value],
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
        description="Where new tasks, habits, goals, notes and sessions start. You can still change each one."
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
        title="Share new items to Live"
        description="Whether what you do shows up on Live for you and your connections. Private items show without their details."
      >
        <div className="flex items-center gap-2.5">
          <Label htmlFor="default-share" className="text-sm text-muted-foreground">
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
      <Row title="Time zone" description="Follows your device, so your days start where you are.">
        <p className="font-medium">{timeZone.replaceAll("_", " ")}</p>
      </Row>
      <Row title="Theme" description="System follows your device's light or dark mode.">
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
        title="Blocked"
        description="They can't see your profile or activity, or send you requests. They aren't told."
      >
        <div className="w-full sm:w-96">
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

const RELAY_OPTIONS: readonly { value: RelayPolicy; label: string; hint: string }[] = RELAY_POLICY.map(
  (value) =>
    ({
      connections: {
        value,
        label: "My connections",
        hint: "Only people you're connected with can pass messages to you through Tibo.",
      },
      anyone: { value, label: "Anyone", hint: "Anyone on Dueboard who hasn't been blocked." },
      none: { value, label: "No one", hint: "Tibo won't take messages from other people's Tibo." },
    })[value],
);

function Tibo() {
  const settings = useBootstrap()?.settings;
  const { save } = useSaveSetting();
  const [policy, setPolicy] = useState<RelayPolicy | null>(null);

  return (
    <Panel>
      <Row
        id="relay-policy"
        title="Messages through Tibo"
        description="Other people can ask their Tibo to pass you a message, and your Tibo asks you before answering. Choose who may."
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

// ─── Account ─────────────────────────────────────────────────────────────────

function Account() {
  const { user } = Route.useRouteContext();
  const [open, setOpen] = useState(false);

  return (
    <Panel>
      <Row
        title="Delete your account"
        description="Deletes your tasks, habits, goals, notes, sessions, tags, connections and settings, then your account. This can't be undone."
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
              Everything you've added to Dueboard is deleted for good, your connections lose you, and
              @{username} is signed out. You can sign up again later, but nothing comes back.
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
