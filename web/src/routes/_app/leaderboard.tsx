import {
  LEADERBOARD_PERIOD,
  LEADERBOARD_SCOPE,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardScope,
} from "@dueboard/api/rpc";
import { useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { TrophyIcon } from "lucide-react";
import { Page, PageEmpty, PageHeader } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { leaderboardAtom, useSocialActions } from "@/hooks/use-social";
import { cn } from "@/lib/utils";

const SCOPE_LABEL: Record<LeaderboardScope, string> = { connections: "Connections", public: "Everyone" };
const PERIOD_LABEL: Record<LeaderboardPeriod, string> = {
  all: "All time",
  month: "This month",
  week: "This week",
  today: "Today",
};

type LeaderboardSearch = {
  scope?: Exclude<LeaderboardScope, "connections"> | undefined;
  period?: Exclude<LeaderboardPeriod, "week"> | undefined;
};

/** Top scorers among your connections or everyone, for a period. Defaults: Connections, This week. */
export const Route = createFileRoute("/_app/leaderboard")({
  // Every key is always returned (see the decision log on `validateSearch`).
  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => ({
    scope: search.scope === "public" ? "public" : undefined,
    period:
      search.period === "all" || search.period === "month" || search.period === "today"
        ? search.period
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Leaderboard · Dueboard" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const scope: LeaderboardScope = search.scope ?? "connections";
  const period: LeaderboardPeriod = search.period ?? "week";

  return (
    <Page>
      <PageHeader
        title="Leaderboard"
        description="+1 for each settled task and finished focus session, and for each habit you check or goal you move on a day."
      />
      <div className="flex w-full max-w-2xl flex-col gap-4 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs
            value={scope}
            onValueChange={(value) =>
              void navigate({
                search: (current) => ({ ...current, scope: value === "public" ? "public" : undefined }),
                replace: true,
              })
            }
          >
            <TabsList aria-label="Whose points">
              {LEADERBOARD_SCOPE.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {SCOPE_LABEL[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            value={period}
            onValueChange={(value) =>
              void navigate({
                search: (current) => ({
                  ...current,
                  period: value === "week" ? undefined : (value as LeaderboardSearch["period"]),
                }),
                replace: true,
              })
            }
          >
            <TabsList aria-label="Which days">
              {LEADERBOARD_PERIOD.map((value) => (
                <TabsTrigger key={value} value={value} className="max-sm:px-1.5 max-sm:text-[0.8125rem]">
                  {PERIOD_LABEL[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Board scope={scope} period={period} />
      </div>
    </Page>
  );
}

function Board({ scope, period }: { scope: LeaderboardScope; period: LeaderboardPeriod }) {
  const result = useAtomValue(leaderboardAtom({ scope, period }));
  const { reload } = useSocialActions();

  if (AsyncResult.isFailure(result)) {
    return (
      <PageEmpty icon={TrophyIcon} title="Couldn't load the leaderboard" description="Check your connection, then try again." className="min-h-56 flex-none rounded-xl border">
        <Button variant="outline" onClick={() => void reload()}>
          Try again
        </Button>
      </PageEmpty>
    );
  }
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    );
  }

  const { entries, me } = result.value;
  if (entries.length === 0) {
    return (
      <PageEmpty
        icon={TrophyIcon}
        title="No points yet"
        description={
          scope === "connections"
            ? `Nobody among you and your connections has scored ${PERIOD_LABEL[period].toLowerCase()}. Settle a task to get on the board.`
            : `Nobody has scored ${PERIOD_LABEL[period].toLowerCase()}. Settle a task to get on the board.`
        }
        className="min-h-56 flex-none rounded-xl border border-dashed"
      >
        {scope === "connections" && (
          <Button asChild variant="outline">
            <Link to="/discover">Find people to connect with</Link>
          </Button>
        )}
      </PageEmpty>
    );
  }

  const meShown = me !== null && entries.some((entry) => entry.person.username === me.person.username);
  return (
    <div className="flex flex-col gap-3">
      <ol className="divide-y rounded-xl border bg-card px-2 shadow-(--card-shadow)">
        {entries.map((entry) => (
          <Row key={entry.person.username} entry={entry} me={entry.person.username === me?.person.username} />
        ))}
      </ol>
      {me && !meShown && (
        <ul aria-label="Your place" className="rounded-xl border bg-card px-2 shadow-(--card-shadow)">
          <Row entry={me} me />
        </ul>
      )}
      {!me && (
        <p className="px-1 text-sm text-muted-foreground">
          You haven't scored {PERIOD_LABEL[period].toLowerCase()} yet.
        </p>
      )}
    </div>
  );
}

function Row({ entry, me }: { entry: LeaderboardEntry; me: boolean }) {
  const podium = entry.rank <= 3;
  return (
    <li className={cn("list-none", me && "-mx-2 rounded-lg bg-primary/5 px-2 dark:bg-primary/10")}>
      <Link
        to="/@{$username}"
        params={{ username: entry.person.username }}
        className="flex items-center gap-3 rounded-md px-2 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "w-7 shrink-0 text-right tabular-nums",
            podium ? "text-lg font-semibold" : "text-sm text-muted-foreground",
          )}
          aria-label={`Rank ${entry.rank}`}
        >
          {entry.rank}
        </span>
        <PersonAvatar person={entry.person} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {entry.person.name}
            {me && <span className="font-normal text-muted-foreground"> (you)</span>}
          </span>
          <span className="truncate text-sm text-muted-foreground">@{entry.person.username}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="font-semibold tabular-nums">{entry.points.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">{entry.points === 1 ? "pt" : "pts"}</span>
        </span>
      </Link>
    </li>
  );
}
