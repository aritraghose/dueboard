import { eq, sql, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, HabitCheckins, UserSettings } from "../schema.ts";
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
import { connectedSql, notBlockedSql } from "./visibility.ts";

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

  const owner = sql`s.user_id`;
  const inScope =
    scope === "connections" ? sql`and (s.user_id = ${viewerId} or ${connectedSql(viewerId, owner)})` : sql``;
  const rows = yield* db
    .execute<RankedRow>(
      sql`with scores as (${scores(from, null)}),
      ranked as (
        select s.user_id, s.points, (rank() over (order by s.points desc))::int as rank
        from scores s
        join ${AuthUsers} u on u.id = s.user_id and u.username is not null
        where ${notBlockedSql(viewerId, owner)}
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
