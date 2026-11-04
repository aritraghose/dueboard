import type { Profile } from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import {
  ListChecksIcon,
  RepeatIcon,
  TargetIcon,
  TimerIcon,
  UserRoundXIcon,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ConnectionActions } from "@/components/connection-actions";
import { ContributionGraph } from "@/components/contribution-graph";
import { DiaryView } from "@/components/diary-view";
import { Page, PageEmpty } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { ProfileFeed } from "@/components/profile-feed";
import { PublicFrame } from "@/components/public-frame";
import { TiboMark } from "@/components/tibo-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { profileAtom, useSocialActions } from "@/hooks/use-social";
import { type LocalDate, isLocalDate, todayIn } from "@/lib/dates";
import { lastCheckedUser, rememberCheckedUser, type OnboardedUser } from "@/lib/session-cache";
import { readSidebarOpen } from "@/lib/sidebar-state";
import { getSessionUser } from "../session.ts";

/**
 * A profile, `/@username` (the literal `@` prefix before the param). Anyone
 * may read it, signed in or not, so it sits outside `_app`'s guard; signed-in
 * viewers who finished onboarding get the app's chrome around it. What the
 * viewer may see is decided by `GetProfile` on the server. Overview holds
 * the activity graph and, below it, the diary; `day` is the graph day the
 * diary starts from.
 */
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "tasks", label: "Tasks" },
  { value: "habits", label: "Habits" },
  { value: "goals", label: "Goals" },
  { value: "sessions", label: "Sessions" },
] as const;
type ProfileTab = (typeof TABS)[number]["value"];
type ProfileSearch = { tab?: Exclude<ProfileTab, "overview"> | undefined; day?: LocalDate | undefined };

export const Route = createFileRoute("/@{$username}")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
    tab: TABS.some(({ value }) => value !== "overview" && value === search.tab)
      ? (search.tab as ProfileSearch["tab"])
      : undefined,
    day: typeof search.day === "string" && isLocalDate(search.day) ? search.day : undefined,
  }),
  beforeLoad: async ({ cause }): Promise<{ user: OnboardedUser | null; sidebarOpen: boolean }> => {
    const checked = lastCheckedUser();
    if (cause === "stay" && checked) return { user: checked, sidebarOpen: readSidebarOpen() };
    // The session only picks the chrome, so a failed lookup shows the public page.
    const session = await getSessionUser().catch(() => null);
    const user = session?.username ? { ...session, username: session.username } : null;
    if (user) rememberCheckedUser(user);
    return { user, sidebarOpen: readSidebarOpen() };
  },
  head: ({ params }) => ({ meta: [{ title: `@${params.username.toLowerCase()} · Dueboard` }] }),
  component: ProfileRoute,
});

function ProfileRoute() {
  const { user, sidebarOpen } = Route.useRouteContext();
  const { username } = Route.useParams();
  const page = <ProfilePage username={username.toLowerCase()} signedIn={user !== null} />;
  if (user) {
    return (
      <AppShell user={user} sidebarOpen={sidebarOpen}>
        {page}
      </AppShell>
    );
  }
  return <PublicFrame>{page}</PublicFrame>;
}

function ProfilePage({ username, signedIn }: { username: string; signedIn: boolean }) {
  const result = useAtomValue(profileAtom(username));
  const { reload } = useSocialActions();

  if (AsyncResult.isFailure(result)) {
    const error = Cause.squash(result.cause) as { _tag?: string } | undefined;
    const missing = error?._tag === "UserNotFound" || error?._tag === "InvalidInput";
    return (
      <Page>
        {missing ? (
          <PageEmpty
            icon={UserRoundXIcon}
            title="This profile isn't available"
            description={`There's no one called @${username}, or you can't see their profile.`}
          >
            <Button asChild variant="outline">
              <Link to={signedIn ? "/now" : "/"}>{signedIn ? "Back to Now" : "Go to Dueboard"}</Link>
            </Button>
          </PageEmpty>
        ) : (
          <PageEmpty
            icon={UserRoundXIcon}
            title="Couldn't load this profile"
            description="Check your connection, then try again."
          >
            <Button variant="outline" onClick={() => void reload()}>
              Try again
            </Button>
          </PageEmpty>
        )}
      </Page>
    );
  }

  const profile = AsyncResult.isSuccess(result) ? result.value : undefined;
  return (
    <Page>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
        {profile ? <ProfileCard profile={profile} signedIn={signedIn} /> : <ProfileSkeleton />}
        {profile && profile.status.state !== "blocked" && <ProfileTabs profile={profile} />}
      </div>
    </Page>
  );
}

function ProfileTabs({ profile }: { profile: Profile }) {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const self = profile.status.state === "self";

  return (
    <Tabs
      value={tab ?? "overview"}
      onValueChange={(value) =>
        void navigate({
          search: { tab: value === "overview" ? undefined : (value as ProfileSearch["tab"]), day: undefined },
          replace: true,
        })
      }
      className="gap-4"
    >
      <TabsList className="max-sm:w-full">
        {TABS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className="max-sm:px-1.5 max-sm:text-[0.8125rem]">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="overview" className="flex flex-col gap-4">
        <Overview profile={profile} />
      </TabsContent>
      {TABS.filter(({ value }) => value !== "overview").map(({ value }) => (
        <TabsContent key={value} value={value}>
          {(tab ?? "overview") === value && (
            <ProfileFeed
              username={profile.person.username}
              feed={value as Exclude<ProfileTab, "overview">}
              self={self}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** The numbers that show how much they get done, the activity graph, then the diary. */
function Overview({ profile }: { profile: Profile }) {
  const { day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const counts = profile.counts;
  // The viewer's today, for the diary's day names; the graph brings the owner's.
  const [today] = useState(() => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"));
  const showDay = (date: LocalDate | undefined) =>
    void navigate({ search: (search) => ({ ...search, day: date }), replace: true, resetScroll: false });
  const stats = counts
    ? [
        { value: counts.tasksSettled, one: "task settled", many: "tasks settled", icon: ListChecksIcon },
        { value: counts.habitsCompleted, one: "habit goal met", many: "habit goals met", icon: RepeatIcon },
        { value: counts.goalsCompleted, one: "goal completed", many: "goals completed", icon: TargetIcon },
        { value: counts.sessionsCompleted, one: "focus session", many: "focus sessions", icon: TimerIcon },
      ]
    : [];

  return (
    <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {stats.map(({ value, one, many, icon: Icon }) => (
          <div key={many} className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-(--card-shadow)">
            <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon className="size-3.5" />
              {value === 1 ? one : many}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <ContributionGraph
        username={profile.person.username}
        color={profile.color}
        selected={day ?? null}
        onSelectDay={(date) => showDay(date === day ? undefined : date)}
      />
      <h2 className="mt-2 px-1 text-lg font-semibold">Diary</h2>
      <DiaryView
        username={profile.person.username}
        self={profile.status.state === "self"}
        today={today}
        from={day ?? null}
        onShowLatest={() => showDay(undefined)}
      />
    </>
  );
}

const joinedFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function ProfileCard({ profile, signedIn }: { profile: Profile; signedIn: boolean }) {
  const { person, status, counts } = profile;
  const connections = counts?.connections;
  const connectionsText =
    connections === undefined ? null : `${connections.toLocaleString()} ${connections === 1 ? "connection" : "connections"}`;

  return (
    <section
      data-tag={profile.color ?? "teal"}
      aria-label={`${person.name}'s profile`}
      className="overflow-hidden rounded-xl border bg-card shadow-(--card-shadow)"
    >
      {/* Only the band wears the owner's user color (also used by Live and the graph). */}
      <div aria-hidden="true" className="profile-band h-24 sm:h-28" />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="-mt-11 flex flex-wrap items-end justify-between gap-3">
          <PersonAvatar person={person} className="size-22 text-2xl ring-4 ring-card" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {profile.askEnabled && (
              <Button asChild variant="outline">
                <Link to="/@{$username}/ask" params={{ username: person.username }}>
                  <TiboMark idle={false} className="size-4" />
                  Ask Tibo
                </Link>
              </Button>
            )}
            <ConnectionActions username={person.username} status={status} signedIn={signedIn} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-semibold break-words">{person.name}</h1>
          <p className="text-muted-foreground">@{person.username}</p>
          <p className="text-sm text-muted-foreground">Joined {joinedFormat.format(profile.joinedAt)}</p>
        </div>
        {status.state === "pending_in" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {person.name.split(/\s+/)[0]} asked to connect with you.
          </p>
        )}
        {status.state === "blocked" && (
          <p className="text-sm text-muted-foreground">
            You blocked @{person.username}.
          </p>
        )}
        {connectionsText && (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            {status.state === "self" ? (
              <Link
                to="/connections"
                className="rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {connectionsText}
              </Link>
            ) : (
              <span className="font-medium">{connectionsText}</span>
            )}
            {counts && (
              <span className="flex items-baseline gap-1.5" title="+1 for each settled task and finished focus session, and for each habit checked or goal moved on a day">
                <span className="text-lg font-semibold tabular-nums">{counts.points.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">{counts.points === 1 ? "point" : "points"}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-(--card-shadow)">
      <Skeleton className="h-24 rounded-none sm:h-28" />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <Skeleton className="-mt-11 size-22 rounded-full ring-4 ring-card" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
