import { and, asc, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  Activity,
  HabitCheckins,
  HabitPauses,
  Habits,
  UserSettings,
  type HabitCheckinRow,
  type HabitPauseRow,
  type HabitRow,
} from "../schema.ts";
import { deleteActivityFor, recordActivity } from "./activity.ts";
import { LocalDate, addDays, startOfWeek, todayIn } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import { deleteLinksFor, onHabitCheckIn } from "./goals.ts";
import {
  dayStatus,
  describeSchedule,
  indexCheckins,
  isScheduledOn,
  normalizeSchedule,
  occurrences,
  progressFor,
  streak,
  type CheckinIndex,
  type HabitPause,
} from "./habit-rules.ts";
import {
  CheckInNotAllowed,
  CreateHabitInput,
  HABIT_CHECKIN_DAYS_BACK,
  HABIT_HISTORY_WEEKS,
  Habit,
  HabitCheckInInput,
  HabitCheckin,
  HabitNotFound,
  HabitOnDay,
  HabitProgress,
  HabitSchedule,
  HabitSummary,
  HabitsForDay,
  Id,
  UpcomingHabit,
  InvalidInput,
  UpdateHabitInput,
  decodeInput,
} from "./model.ts";

export const toHabit = (row: HabitRow): Habit =>
  new Habit({
    id: row.id,
    title: row.title,
    description: row.description,
    scheduleKind: row.scheduleKind,
    targetCount: row.targetCount,
    periodUnit: row.periodUnit,
    periodLength: row.periodLength,
    weekdays: row.weekdays,
    monthDays: row.monthDays,
    startDate: row.startDate,
    status: row.status,
    privacy: row.privacy,
    shareToLive: row.shareToLive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const notFound = (id: string) => new HabitNotFound({ message: "That habit no longer exists.", id });

const findHabit = (tx: Executor, userId: string, id: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(Habits)
      .where(and(eq(Habits.id, id), eq(Habits.userId, userId)));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(id);
    return row;
  });

const userSettings = (tx: Executor, userId: string) =>
  Effect.gen(function* () {
    const [settings] = yield* tx
      .select({
        timeZone: UserSettings.timeZone,
        defaultPrivacy: UserSettings.defaultPrivacy,
        defaultShareToLive: UserSettings.defaultShareToLive,
      })
      .from(UserSettings)
      .where(eq(UserSettings.userId, userId));
    if (!settings) return yield* Effect.die(new Error(`User ${userId} has no settings`));
    return settings;
  });

const userToday = (tx: Executor, userId: string) =>
  userSettings(tx, userId).pipe(Effect.map((settings) => todayIn(settings.timeZone)));

const scheduleColumns = (schedule: HabitSchedule) => {
  const result = normalizeSchedule(schedule);
  return result.ok ? Effect.succeed(result.columns) : Effect.fail(new InvalidInput({ message: result.message }));
};

const loadPauses = (tx: Executor, habitIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const byHabit = new Map<string, Array<HabitPauseRow>>();
    if (habitIds.length === 0) return byHabit;
    const rows = yield* tx
      .select()
      .from(HabitPauses)
      .where(inArray(HabitPauses.habitId, [...habitIds]))
      .orderBy(asc(HabitPauses.startDate));
    for (const row of rows) {
      const list = byHabit.get(row.habitId) ?? [];
      list.push(row);
      byHabit.set(row.habitId, list);
    }
    return byHabit;
  });

const loadCheckins = (tx: Executor, userId: string, habitIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const byHabit = new Map<string, Array<HabitCheckinRow>>();
    if (habitIds.length === 0) return byHabit;
    const rows = yield* tx
      .select()
      .from(HabitCheckins)
      .where(
        and(
          eq(HabitCheckins.userId, userId),
          inArray(HabitCheckins.habitId, [...habitIds]),
          gt(HabitCheckins.count, 0),
        ),
      )
      .orderBy(asc(HabitCheckins.localDate));
    for (const row of rows) {
      const list = byHabit.get(row.habitId) ?? [];
      list.push(row);
      byHabit.set(row.habitId, list);
    }
    return byHabit;
  });

const toProgress = (habit: HabitRow, index: CheckinIndex, date: LocalDate) => {
  const { period, done, target, complete } = progressFor(habit, index, date);
  return new HabitProgress({ periodStart: period.start, periodEnd: period.end, done, target, complete });
};

const habitOnDay = (
  habit: HabitRow,
  pauses: ReadonlyArray<HabitPause>,
  index: CheckinIndex,
  date: LocalDate,
  today: LocalDate,
) =>
  new HabitOnDay({
    habit: toHabit(habit),
    schedule: describeSchedule(habit),
    date,
    status: dayStatus(habit, pauses, index, date),
    progress: toProgress(habit, index, date),
    countOnDay: index.get(date) ?? 0,
    streak: streak(habit, pauses, index, today),
  });

const habitSummary = (
  habit: HabitRow,
  pauses: ReadonlyArray<HabitPause>,
  checkins: ReadonlyArray<HabitCheckinRow>,
  today: LocalDate,
) => {
  const index = indexCheckins(checkins);
  const from = addDays(startOfWeek(today), -7 * (HABIT_HISTORY_WEEKS - 1));
  return new HabitSummary({
    habit: toHabit(habit),
    schedule: describeSchedule(habit),
    streak: streak(habit, pauses, index, today),
    progress: toProgress(habit, index, today),
    history: checkins
      .filter((c) => c.localDate >= from && c.localDate <= today)
      .map((c) => new HabitCheckin({ date: c.localDate, count: c.count })),
  });
};

export const createHabit = Effect.fn("createHabit")(function* (
  userId: string,
  input: CreateHabitInput,
) {
  const values = yield* decodeInput(CreateHabitInput)(input);
  const schedule = yield* scheduleColumns(values.schedule);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const settings = yield* userSettings(tx, userId);
      const now = new Date();
      const [row] = yield* tx
        .insert(Habits)
        .values({
          id: newId(),
          userId,
          title: values.title,
          description: values.description ?? null,
          ...schedule,
          weekdays: schedule.weekdays ? [...schedule.weekdays] : null,
          monthDays: schedule.monthDays ? [...schedule.monthDays] : null,
          startDate: values.startDate ?? todayIn(settings.timeZone),
          privacy: values.privacy ?? settings.defaultPrivacy,
          shareToLive: values.shareToLive ?? settings.defaultShareToLive,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toHabit(row!);
    }),
  );
});

export const updateHabit = Effect.fn("updateHabit")(function* (
  userId: string,
  input: UpdateHabitInput,
) {
  const { id, schedule, ...rest } = yield* decodeInput(UpdateHabitInput)(input);
  const columns = schedule ? yield* scheduleColumns(schedule) : undefined;
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findHabit(tx, userId, id, true);
      const patch = {
        ...rest,
        ...(columns && {
          ...columns,
          weekdays: columns.weekdays ? [...columns.weekdays] : null,
          monthDays: columns.monthDays ? [...columns.monthDays] : null,
        }),
      };
      if (Object.keys(patch).length === 0) return toHabit(current);
      const [row] = yield* tx
        .update(Habits)
        .set(patch)
        .where(and(eq(Habits.id, id), eq(Habits.userId, userId)))
        .returning();
      return toHabit(row!);
    }),
  );
});

const openPause = (tx: Executor, habitId: string, today: LocalDate) =>
  tx.insert(HabitPauses).values({ id: newId(), habitId, startDate: today, endDate: null });

export const pauseHabit = Effect.fn("pauseHabit")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findHabit(tx, userId, id, true);
      if (current.status === "paused") return toHabit(current);
      if (current.status === "archived") {
        return yield* new InvalidInput({ message: "Restore this habit before pausing it." });
      }
      yield* openPause(tx, id, yield* userToday(tx, userId));
      const [row] = yield* tx.update(Habits).set({ status: "paused" }).where(eq(Habits.id, id)).returning();
      return toHabit(row!);
    }),
  );
});

export const resumeHabit = Effect.fn("resumeHabit")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findHabit(tx, userId, id, true);
      if (current.status === "active") return toHabit(current);
      const today = yield* userToday(tx, userId);
      const open = and(eq(HabitPauses.habitId, id), isNull(HabitPauses.endDate));
      yield* tx.delete(HabitPauses).where(and(open, gte(HabitPauses.startDate, today)));
      yield* tx.update(HabitPauses).set({ endDate: today }).where(open);
      const [row] = yield* tx.update(Habits).set({ status: "active" }).where(eq(Habits.id, id)).returning();
      return toHabit(row!);
    }),
  );
});

export const archiveHabit = Effect.fn("archiveHabit")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findHabit(tx, userId, id, true);
      if (current.status === "archived") return toHabit(current);
      if (current.status === "active") yield* openPause(tx, id, yield* userToday(tx, userId));
      const [row] = yield* tx.update(Habits).set({ status: "archived" }).where(eq(Habits.id, id)).returning();
      return toHabit(row!);
    }),
  );
});

export const deleteHabit = Effect.fn("deleteHabit")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* findHabit(tx, userId, id, true);
      yield* deleteLinksFor(tx, userId, "habit", id);
      yield* deleteActivityFor(tx, "habit", id);
      yield* tx.delete(Habits).where(and(eq(Habits.id, id), eq(Habits.userId, userId)));
      return id;
    }),
  );
});

const completedIn = (userId: string, habitId: string, periodStart: LocalDate) =>
  and(
    eq(Activity.userId, userId),
    eq(Activity.subjectType, "habit"),
    eq(Activity.subjectId, habitId),
    eq(Activity.kind, "habit_completed"),
    sql`${Activity.meta}->>'periodStart' = ${periodStart}`,
  );

const tap = (userId: string, input: HabitCheckInInput, delta: 1 | -1) =>
  Effect.gen(function* () {
    const { id, date } = yield* decodeInput(HabitCheckInInput)(input);
    const db = yield* Database;
    return yield* transaction(db, (tx) =>
      Effect.gen(function* () {
        const habit = yield* findHabit(tx, userId, id, true);
        if (habit.status === "archived") {
          return yield* new CheckInNotAllowed({
            message: "Restore this habit to check in.",
            reason: "not_active",
          });
        }
        const today = yield* userToday(tx, userId);
        if (date > today) {
          return yield* new CheckInNotAllowed({ message: "You can't check in ahead of time.", reason: "future" });
        }
        if (date < addDays(today, -HABIT_CHECKIN_DAYS_BACK)) {
          return yield* new CheckInNotAllowed({
            message: `Check-ins reach back ${HABIT_CHECKIN_DAYS_BACK} days at most.`,
            reason: "too_old",
          });
        }
        const pauses = (yield* loadPauses(tx, [id])).get(id) ?? [];
        if (!isScheduledOn(habit, pauses, date)) {
          return yield* new CheckInNotAllowed({ message: "This habit isn't due that day.", reason: "not_due" });
        }

        const checkins = (yield* loadCheckins(tx, userId, [id])).get(id) ?? [];
        const before = indexCheckins(checkins);
        const onDay = before.get(date) ?? 0;
        if (delta === -1 && onDay === 0) return habitOnDay(habit, pauses, before, date, today);

        if (delta === 1) {
          yield* tx
            .insert(HabitCheckins)
            .values({ id: newId(), habitId: id, userId, localDate: date, count: 1 })
            .onConflictDoUpdate({
              target: [HabitCheckins.habitId, HabitCheckins.localDate],
              set: { count: sql`${HabitCheckins.count} + 1`, updatedAt: new Date() },
            });
        } else {
          yield* tx
            .update(HabitCheckins)
            .set({ count: sql`${HabitCheckins.count} - 1` })
            .where(and(eq(HabitCheckins.habitId, id), eq(HabitCheckins.localDate, date)));
        }
        const after = new Map(before).set(date, onDay + delta);
        yield* recordDayCheck(tx, userId, id, date, onDay + delta, delta);

        const was = progressFor(habit, before, date);
        const now = progressFor(habit, after, date);
        if (!was.complete && now.complete) {
          const [existing] = yield* tx
            .select({ id: Activity.id })
            .from(Activity)
            .where(completedIn(userId, id, now.period.start));
          if (!existing) {
            yield* recordActivity(tx, {
              userId,
              kind: "habit_completed",
              subjectType: "habit",
              subjectId: id,
              localDate: date,
              meta: { periodStart: now.period.start, periodEnd: now.period.end },
            });
          }
        } else if (was.complete && !now.complete) {
          yield* tx.delete(Activity).where(completedIn(userId, id, now.period.start));
        }
        yield* onHabitCheckIn(tx, habit, delta, date);
        return habitOnDay(habit, pauses, after, date, today);
      }),
    );
  });

const recordDayCheck = (tx: Executor, userId: string, habitId: string, date: LocalDate, count: number, delta: 1 | -1) =>
  Effect.gen(function* () {
    const onDay = and(
      eq(Activity.subjectType, "habit"),
      eq(Activity.subjectId, habitId),
      eq(Activity.kind, "habit_checked"),
      eq(Activity.localDate, date),
    );
    if (count <= 0) {
      yield* tx.delete(Activity).where(onDay);
      return;
    }
    const [existing] = yield* tx.select({ id: Activity.id }).from(Activity).where(onDay);
    if (!existing) {
      yield* recordActivity(tx, {
        userId,
        kind: "habit_checked",
        subjectType: "habit",
        subjectId: habitId,
        localDate: date,
        meta: { count },
      });
    } else {
      yield* tx
        .update(Activity)
        .set({ meta: { count }, ...(delta === 1 ? { occurredAt: new Date() } : {}) })
        .where(eq(Activity.id, existing.id));
    }
  });

export const checkIn = Effect.fn("checkIn")(function* (userId: string, input: HabitCheckInInput) {
  return yield* tap(userId, input, 1);
});

export const undoCheckIn = Effect.fn("undoCheckIn")(function* (userId: string, input: HabitCheckInInput) {
  return yield* tap(userId, input, -1);
});

export const getHabit = Effect.fn("getHabit")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const habit = yield* findHabit(db, userId, id);
    const today = yield* userToday(db, userId);
    const pauses = (yield* loadPauses(db, [id])).get(id) ?? [];
    const checkins = (yield* loadCheckins(db, userId, [id])).get(id) ?? [];
    return habitSummary(habit, pauses, checkins, today);
  }).pipe(orDieOnDbError);
});

export const listHabitsForDay = Effect.fn("listHabitsForDay")(function* (
  userId: string,
  date: LocalDate,
) {
  const day = yield* decodeInput(LocalDate)(date);
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const habits = yield* db
      .select()
      .from(Habits)
      .where(and(eq(Habits.userId, userId), ne(Habits.status, "archived")))
      .orderBy(asc(Habits.createdAt), asc(Habits.id));
    const ids = habits.map((h) => h.id);
    const today = yield* userToday(db, userId);
    const pauses = yield* loadPauses(db, ids);
    const checkins = yield* loadCheckins(db, userId, ids);
    const due: Array<HabitOnDay> = [];
    const settled: Array<HabitOnDay> = [];
    for (const habit of habits) {
      const entry = habitOnDay(
        habit,
        pauses.get(habit.id) ?? [],
        indexCheckins(checkins.get(habit.id) ?? []),
        day,
        today,
      );
      if (entry.status === "due") due.push(entry);
      else if (entry.status === "complete") settled.push(entry);
    }
    return new HabitsForDay({
      date: day,
      due,
      settled,
      allChecked: due.length === 0 && settled.length > 0,
    });
  }).pipe(orDieOnDbError);
});

export const listUpcomingHabits = (userId: string, from: LocalDate, until: LocalDate) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const habits = yield* db
      .select()
      .from(Habits)
      .where(and(eq(Habits.userId, userId), ne(Habits.status, "archived")))
      .orderBy(asc(Habits.createdAt), asc(Habits.id));
    const ids = habits.map((h) => h.id);
    const pauses = yield* loadPauses(db, ids);
    const checkins = yield* loadCheckins(db, userId, ids);
    const byDay = new Map<LocalDate, Array<UpcomingHabit>>();
    for (const habit of habits) {
      const index = indexCheckins(checkins.get(habit.id) ?? []);
      for (const { date, period, done, target, complete } of occurrences(
        habit,
        pauses.get(habit.id) ?? [],
        index,
        from,
        until,
      )) {
        const list = byDay.get(date) ?? [];
        list.push(
          new UpcomingHabit({
            habit: toHabit(habit),
            schedule: describeSchedule(habit),
            progress: new HabitProgress({ periodStart: period.start, periodEnd: period.end, done, target, complete }),
          }),
        );
        byDay.set(date, list);
      }
    }
    return byDay;
  }).pipe(orDieOnDbError);

export const listHabits = Effect.fn("listHabits")(function* (userId: string) {
  const db = yield* Database;
  return yield* Effect.gen(function* () {
    const habits = yield* db
      .select()
      .from(Habits)
      .where(eq(Habits.userId, userId))
      .orderBy(asc(Habits.createdAt), asc(Habits.id));
    const ids = habits.map((h) => h.id);
    const today = yield* userToday(db, userId);
    const pauses = yield* loadPauses(db, ids);
    const checkins = yield* loadCheckins(db, userId, ids);
    return habits.map((habit) =>
      habitSummary(habit, pauses.get(habit.id) ?? [], checkins.get(habit.id) ?? [], today),
    );
  }).pipe(orDieOnDbError);
});
