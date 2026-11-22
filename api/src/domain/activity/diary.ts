import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, FocusSessions, Goals, Habits, Notes, Tasks, UserSettings } from "../schema.ts";
import { Database, orDieOnDbError } from "./database.ts";
import { FALLBACK_TIME_ZONE, todayIn, type LocalDate } from "./dates.ts";
import { DIARY_KINDS, DIARY_PAGE_DAYS, GRAPH_KINDS, graphRange, pickDiaryDays } from "./diary-rules.ts";
import { eventMeta, focusedMinutes } from "./live.ts";
import {
  ContributionDay,
  ContributionGraph,
  DiaryDay,
  DiaryEntry,
  DiaryPage,
  GetContributionGraphInput,
  GetDiaryInput,
  InvalidInput,
  decodeInput,
} from "./model.ts";
import { profileOwner } from "./profile-items.ts";
import {
  activitySubjectExists,
  activitySubjectJoin,
  activitySubjectPrivacy,
  activitySubjectTitle,
  privacyVisibleSql,
} from "./visibility.ts";

const notCoveredMove = sql`(${Activity.kind} <> 'goal_progressed' or not exists (
  select 1 from ${Activity} c
  where c.kind = 'goal_completed' and c.subject_type = 'goal'
    and c.subject_id = ${Activity.subjectId} and c.local_date = ${Activity.localDate}))`;

export const getDiary = Effect.fn("getDiary")(function* (viewerId: string | null, input: GetDiaryInput) {
  const { username, cursor, from } = yield* decodeInput(GetDiaryInput)(input);
  const owner = yield* profileOwner(viewerId, username);
  if (owner.hidden) return new DiaryPage({ days: [], nextCursor: null });
  const db = yield* Database;

  const visible = (dates?: LocalDate[]) =>
    and(
      eq(Activity.userId, owner.id),
      inArray(Activity.kind, [...DIARY_KINDS]),
      activitySubjectExists,
      privacyVisibleSql(owner.relation, activitySubjectPrivacy),
      notCoveredMove,
      cursor ? lt(Activity.localDate, cursor) : undefined,
      from ? lte(Activity.localDate, from) : undefined,
      dates ? inArray(Activity.localDate, dates) : undefined,
    );

  const dayCounts = yield* db
    .select({ date: Activity.localDate, count: count() })
    .from(Activity)
    .leftJoin(Tasks, activitySubjectJoin.task)
    .leftJoin(Habits, activitySubjectJoin.habit)
    .leftJoin(Goals, activitySubjectJoin.goal)
    .leftJoin(FocusSessions, activitySubjectJoin.session)
    .leftJoin(Notes, activitySubjectJoin.note)
    .where(visible())
    .groupBy(Activity.localDate)
    .orderBy(desc(Activity.localDate))
    .limit(DIARY_PAGE_DAYS + 1)
    .pipe(orDieOnDbError);
  const { dates, more } = pickDiaryDays(dayCounts.map((day) => ({ date: day.date as LocalDate, count: day.count })));
  if (dates.length === 0) return new DiaryPage({ days: [], nextCursor: null });

  const rows = yield* db
    .select({
      id: Activity.id,
      kind: Activity.kind,
      localDate: Activity.localDate,
      occurredAt: Activity.occurredAt,
      meta: Activity.meta,
      title: activitySubjectTitle,
      privacy: activitySubjectPrivacy,
      plannedMinutes: FocusSessions.plannedMinutes,
      focusedMinutes,
    })
    .from(Activity)
    .leftJoin(Tasks, activitySubjectJoin.task)
    .leftJoin(Habits, activitySubjectJoin.habit)
    .leftJoin(Goals, activitySubjectJoin.goal)
    .leftJoin(FocusSessions, activitySubjectJoin.session)
    .leftJoin(Notes, activitySubjectJoin.note)
    .where(visible(dates))
    .orderBy(desc(Activity.localDate), desc(Activity.occurredAt), desc(Activity.id))
    .pipe(orDieOnDbError);

  const days = dates.map((date) => ({ date, entries: [] as DiaryEntry[] }));
  const byDate = new Map(days.map((day) => [day.date, day.entries]));
  for (const row of rows) {
    byDate.get(row.localDate as LocalDate)?.push(
      new DiaryEntry({
        id: row.id,
        kind: row.kind,
        title: row.title,
        occurredAt: row.occurredAt,
        privacy: row.privacy!,
        meta: eventMeta(row),
      }),
    );
  }
  return new DiaryPage({
    days: days.map((day) => new DiaryDay(day)),
    nextCursor: more ? dates.at(-1)! : null,
  });
});

export const getContributionGraph = Effect.fn("getContributionGraph")(function* (
  viewerId: string | null,
  input: GetContributionGraphInput,
) {
  const { username, from, to } = yield* decodeInput(GetContributionGraphInput)(input);
  const owner = yield* profileOwner(viewerId, username);
  const db = yield* Database;
  const [settings] = yield* db
    .select({ timeZone: UserSettings.timeZone })
    .from(UserSettings)
    .where(eq(UserSettings.userId, owner.id))
    .pipe(orDieOnDbError);
  const today = todayIn(settings?.timeZone ?? FALLBACK_TIME_ZONE);
  const range = graphRange(today, from, to);
  if (!range) return yield* new InvalidInput({ message: "Pick a range of at most 53 weeks." });
  if (owner.hidden) return new ContributionGraph({ ...range, today, days: [], total: 0 });

  const rows = yield* db
    .select({ date: Activity.localDate, count: count() })
    .from(Activity)
    .where(
      and(
        eq(Activity.userId, owner.id),
        inArray(Activity.kind, [...GRAPH_KINDS]),
        gte(Activity.localDate, range.from),
        lte(Activity.localDate, range.to),
      ),
    )
    .groupBy(Activity.localDate)
    .orderBy(asc(Activity.localDate))
    .pipe(orDieOnDbError);

  return new ContributionGraph({
    ...range,
    today,
    days: rows.map((row) => new ContributionDay({ date: row.date as LocalDate, count: row.count })),
    total: rows.reduce((sum, row) => sum + row.count, 0),
  });
});
