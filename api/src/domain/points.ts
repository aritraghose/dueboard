import { eq, sql, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  Activity,
  Blocks,
  Connections,
  HabitCheckins,
  UserSettings,
} from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { FALLBACK_TIME_ZONE, todayIn, type LocalDate } from "./dates.ts";
import { Database, orDieOnDbError, type Executor } from "./database.ts";
import {
  GetLeaderboardInput,
  LEADERBOARD_SIZE,
  Leaderboard,
  LeaderboardEntry,
  Person,
  decodeInput,
} from "./model.ts";
import { periodStart } from "./points-rules.ts";

// Points and the leaderboard. Points aren't stored: they're counted from
// the rows the actions already leave (the rules are in `points-rules.ts`),
// so undos take them back and there's no ledger to keep in step. Counts
// include private items, like the contribution graph: they never show
// what was done. Fine at v1 scale; a per-user, per-day table can replace
// the counting later without changing the RPCs.

/**
 * `(user_id, points)` for days from `from` on (every day when `null`),
 * for one user when `userId` is set, everyone otherwise.
 */
const scores = (from: LocalDate | null, userId: string | null): SQL => {
  const activityFrom = from ? sql` and ${Activity.localDate} >= ${from}` : sql``;
  const checkinFrom = from ? sql` and ${HabitCheckins.localDate} >= ${from}` : sql``;
  const activityUser = userId ? sql` and ${Activity.userId} = ${userId}` : sql``;
  const checkinUser = userId ? sql` and ${HabitCheckins.userId} = ${userId}` : sql``;
  return sql`select earned.user_id, count(*)::int as points from (
    select ${Activity.userId} as user_id from ${Activity}
      where ${Activity.kind} in ('task_settled', 'goal_progressed', 'session_completed')${activityFrom}${activityUser}
    union all
    select ${HabitCheckins.userId} as user_id from ${HabitCheckins}
      where ${HabitCheckins.count} > 0${checkinFrom}${checkinUser}
  ) earned group by earned.user_id`;
};

/** A user's points over all time. */
export const pointsOf = (tx: Executor, userId: string) =>
  Effect.gen(function* () {
    const rows = yield* tx.execute<{ points: number }>(scores(null, userId), "objects");
    return rows[0]?.points ?? 0;
  });

type RankedRow = {
  rank: number;
  points: number;
  user_id: string;
  username: string;
  name: string;
  image: string | null;
};

/**
 * The top scorers for the viewer: in `connections` scope the viewer and
 * their connections, in `public` everyone. Anyone blocked either way is
 * left out. `period` counts days in the viewer's zone. The viewer's own row
 * comes back as `me` (and in `entries` if they're in the top ranks).
 */
export const getLeaderboard = Effect.fn("getLeaderboard")(function* (
  viewerId: string,
  input: GetLeaderboardInput,
) {
  const { scope, period } = yield* decodeInput(GetLeaderboardInput)(input);
  const db = yield* Database;
  const [settings] = yield* db
    .select({ timeZone: UserSettings.timeZone })
    .from(UserSettings)
    .where(eq(UserSettings.userId, viewerId))
    .pipe(orDieOnDbError);
  const from = periodStart(period, todayIn(settings?.timeZone ?? FALLBACK_TIME_ZONE));

  const inScope =
    scope === "connections"
      ? sql`and (s.user_id = ${viewerId} or exists (
          select 1 from ${Connections}
          where (${Connections.userLow} = ${viewerId} and ${Connections.userHigh} = s.user_id)
             or (${Connections.userHigh} = ${viewerId} and ${Connections.userLow} = s.user_id)))`
      : sql``;
  const rows = yield* db
    .execute<RankedRow>(
      sql`with scores as (${scores(from, null)}),
      ranked as (
        select s.user_id, s.points, (rank() over (order by s.points desc))::int as rank
        from scores s
        join ${AuthUsers} u on u.id = s.user_id and u.username is not null
        where not exists (
          select 1 from ${Blocks}
          where (${Blocks.blockerId} = ${viewerId} and ${Blocks.blockedId} = s.user_id)
             or (${Blocks.blockerId} = s.user_id and ${Blocks.blockedId} = ${viewerId}))
        ${inScope}
      )
      select r.rank, r.points, r.user_id, u.username, u.name, u.image
      from ranked r join ${AuthUsers} u on u.id = r.user_id
      where r.rank <= ${LEADERBOARD_SIZE} or r.user_id = ${viewerId}
      order by r.rank, u.username`,
      "objects",
    )
    .pipe(orDieOnDbError);

  const toEntry = (row: RankedRow) =>
    new LeaderboardEntry({
      rank: row.rank,
      points: row.points,
      person: new Person({ username: row.username, name: row.name, image: row.image }),
    });
  const mine = rows.find((row) => row.user_id === viewerId);
  return new Leaderboard({
    entries: rows.filter((row) => row.rank <= LEADERBOARD_SIZE).map(toEntry),
    me: mine ? toEntry(mine) : null,
    from,
  });
});
