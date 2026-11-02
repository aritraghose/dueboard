import { defineRelations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  ACTIVITY_KIND,
  ACTIVITY_SUBJECT,
  HABIT_DESCRIPTION_MAX_LENGTH,
  HABIT_PERIOD_LENGTH_MAX,
  HABIT_PERIOD_UNIT,
  HABIT_SCHEDULE_KIND,
  HABIT_STATUS,
  HABIT_TARGET_MAX,
  HABIT_TITLE_MAX_LENGTH,
  PRIVACY,
  RELAY_POLICY,
  SYSTEM_TAG_KIND,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_EXPECTED_MINUTES_MAX,
  TASK_IMPORTANCE_MAX,
  TASK_STATUS,
  TASK_TITLE_MAX_LENGTH,
  USER_COLOR,
  type TagColor,
  type UserColor,
} from "./domain/model.ts";
import type { LocalDate } from "./domain/dates.ts";

// The app's Drizzle tables. Define each table here with `pgTable(...)` and
// add it to `defineRelations` below. Better Auth owns (and migrates) its own
// tables, so they aren't declared here; reference its `user.id` as a plain
// text column, without a foreign key, because Drizzle's migrations run
// before Better Auth's.
//
// Ids are `crypto.randomUUID()` strings in `text` columns, made by the
// domain services (see architecture.md §4). Timestamps are `timestamptz`;
// calendar days are `date` in the owner's time zone.

const id = () => text("id").primaryKey();
const userId = () => text("user_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const privacy = pgEnum("privacy", PRIVACY);
export const relayPolicy = pgEnum("relay_policy", RELAY_POLICY);
export const systemTagKind = pgEnum("system_tag_kind", SYSTEM_TAG_KIND);
export const activityKind = pgEnum("activity_kind", ACTIVITY_KIND);
export const activitySubject = pgEnum("activity_subject", ACTIVITY_SUBJECT);
export const taskStatus = pgEnum("task_status", TASK_STATUS);
export const habitScheduleKind = pgEnum("habit_schedule_kind", HABIT_SCHEDULE_KIND);
export const habitPeriodUnit = pgEnum("habit_period_unit", HABIT_PERIOD_UNIT);
export const habitStatus = pgEnum("habit_status", HABIT_STATUS);

/** One row per user, created by `ensureUserSetup` on the first app load. */
export const UserSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  /** IANA zone, kept in sync with the browser's on every app load. */
  timeZone: text("time_zone").notNull(),
  /**
   * A key of `USER_COLOR`, picked by `ensureUserSetup`. The random default
   * only backfills rows that existed before this column.
   */
  color: text("color")
    .$type<UserColor>()
    .notNull()
    .default(
      sql.raw(
        `(array[${USER_COLOR.map((c) => `'${c}'`).join(", ")}])[floor(random() * ${USER_COLOR.length})::int + 1]`,
      ),
    ),
  defaultPrivacy: privacy("default_privacy").notNull().default("connections"),
  defaultShareToLive: boolean("default_share_to_live").notNull().default(true),
  relayPolicy: relayPolicy("relay_policy").notNull().default("connections"),
  /** Replaces `AI_MONTHLY_MESSAGE_QUOTA` for this user when set. */
  aiQuotaOverride: integer("ai_quota_override"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export type UserSettingsRow = typeof UserSettings.$inferSelect;

export const Tags = pgTable(
  "tags",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    /** A key of the palette in `domain/model.ts` (`TAG_COLOR`). */
    color: text("color").$type<TagColor>().notNull(),
    systemKind: systemTagKind("system_kind"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tags_user_name_idx").on(t.userId, sql`lower(${t.name})`),
    // At most one tag of each system kind per user.
    uniqueIndex("tags_user_system_kind_idx")
      .on(t.userId, t.systemKind)
      .where(sql`${t.systemKind} is not null`),
  ],
);
export type TagRow = typeof Tags.$inferSelect;

/**
 * A task appears on its assigned date, its deadline date, or both; with
 * neither it's "unscheduled". The rules live in `domain/tasks.ts`.
 */
export const Tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    description: text("description"),
    assignedDate: date("assigned_date", { mode: "string" }).$type<LocalDate>(),
    deadlineDate: date("deadline_date", { mode: "string" }).$type<LocalDate>(),
    /** Deleting a tag first moves its tasks to `default` (`domain/tags.ts`). */
    tagId: text("tag_id")
      .notNull()
      .references(() => Tags.id, { onDelete: "restrict" }),
    status: taskStatus("status").notNull().default("idle"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    privacy: privacy("privacy").notNull(),
    shareToLive: boolean("share_to_live").notNull(),
    importance: smallint("importance"),
    expectedMinutes: integer("expected_minutes"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("tasks_user_assigned_idx").on(t.userId, t.assignedDate),
    index("tasks_user_deadline_idx").on(t.userId, t.deadlineDate),
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_user_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    index("tasks_user_unscheduled_idx")
      .on(t.userId, t.status)
      .where(sql`${t.assignedDate} is null and ${t.deadlineDate} is null`),
    index("tasks_tag_idx").on(t.tagId),
    check(
      "tasks_title_length",
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(TASK_TITLE_MAX_LENGTH))}`,
    ),
    check(
      "tasks_description_length",
      sql`char_length(${t.description}) <= ${sql.raw(String(TASK_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check(
      "tasks_importance_range",
      sql`${t.importance} between 1 and ${sql.raw(String(TASK_IMPORTANCE_MAX))}`,
    ),
    check(
      "tasks_expected_minutes_range",
      sql`${t.expectedMinutes} between 1 and ${sql.raw(String(TASK_EXPECTED_MINUTES_MAX))}`,
    ),
    check(
      "tasks_dates_order",
      sql`${t.assignedDate} is null or ${t.deadlineDate} is null or ${t.assignedDate} <= ${t.deadlineDate}`,
    ),
    check(
      "tasks_settled_at",
      sql`(${t.status} = 'settled') = (${t.settledAt} is not null)`,
    ),
  ],
);
export type TaskRow = typeof Tasks.$inferSelect;

/**
 * A habit stores its rule only; nothing is generated ahead of time. The
 * rules live in `domain/habit-rules.ts` (pure) and `domain/habits.ts`.
 */
export const Habits = pgTable(
  "habits",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    description: text("description"),
    scheduleKind: habitScheduleKind("schedule_kind").notNull(),
    targetCount: smallint("target_count").notNull(),
    /** `day` × 1 for `specific_days`. */
    periodUnit: habitPeriodUnit("period_unit").notNull(),
    periodLength: smallint("period_length").notNull(),
    /** 0 = Sun … 6 = Sat. Set only for weekday habits. */
    weekdays: smallint("weekdays").array(),
    /** 1–31. Set only for month-day habits. */
    monthDays: smallint("month_days").array(),
    startDate: date("start_date", { mode: "string" }).$type<LocalDate>().notNull(),
    status: habitStatus("status").notNull().default("active"),
    privacy: privacy("privacy").notNull(),
    shareToLive: boolean("share_to_live").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("habits_user_created_idx").on(t.userId, t.createdAt, t.id),
    index("habits_user_status_idx").on(t.userId, t.status),
    check(
      "habits_title_length",
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(HABIT_TITLE_MAX_LENGTH))}`,
    ),
    check(
      "habits_description_length",
      sql`char_length(${t.description}) <= ${sql.raw(String(HABIT_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check(
      "habits_target_range",
      sql`${t.targetCount} between 1 and ${sql.raw(String(HABIT_TARGET_MAX))}`,
    ),
    check(
      "habits_period_length_range",
      sql`${t.periodLength} between 1 and ${sql.raw(String(HABIT_PERIOD_LENGTH_MAX))}`,
    ),
    // Flexible habits have no days; specific-days habits have exactly one
    // non-empty list of valid days, and a day × 1 period.
    check(
      "habits_schedule_shape",
      sql`(${t.scheduleKind} = 'flexible' and ${t.weekdays} is null and ${t.monthDays} is null)
        or (${t.scheduleKind} = 'specific_days' and ${t.periodUnit} = 'day' and ${t.periodLength} = 1
          and ((${t.weekdays} is null) <> (${t.monthDays} is null))
          and (${t.weekdays} is null or (cardinality(${t.weekdays}) > 0 and ${t.weekdays} <@ '{0,1,2,3,4,5,6}'::smallint[]))
          and (${t.monthDays} is null or (cardinality(${t.monthDays}) > 0 and 0 < all(${t.monthDays}) and 32 > all(${t.monthDays}))))`,
    ),
  ],
);
export type HabitRow = typeof Habits.$inferSelect;

/**
 * Pause and resume history. A pause covers `[start_date, end_date)`: the
 * resume day is due again. `end_date` is null while it's open, which
 * `paused` and `archived` habits always have (at most one per habit).
 */
export const HabitPauses = pgTable(
  "habit_pauses",
  {
    id: id(),
    habitId: text("habit_id")
      .notNull()
      .references(() => Habits.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).$type<LocalDate>().notNull(),
    endDate: date("end_date", { mode: "string" }).$type<LocalDate>(),
  },
  (t) => [
    index("habit_pauses_habit_idx").on(t.habitId, t.startDate),
    uniqueIndex("habit_pauses_open_idx").on(t.habitId).where(sql`${t.endDate} is null`),
    check("habit_pauses_order", sql`${t.endDate} is null or ${t.endDate} > ${t.startDate}`),
  ],
);
export type HabitPauseRow = typeof HabitPauses.$inferSelect;

/** Taps per habit and day (the owner's zone). An undo to zero keeps the row at 0. */
export const HabitCheckins = pgTable(
  "habit_checkins",
  {
    id: id(),
    habitId: text("habit_id")
      .notNull()
      .references(() => Habits.id, { onDelete: "cascade" }),
    userId: userId(),
    localDate: date("local_date", { mode: "string" }).$type<LocalDate>().notNull(),
    count: integer("count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("habit_checkins_habit_date_idx").on(t.habitId, t.localDate),
    index("habit_checkins_user_date_idx").on(t.userId, t.localDate),
    check("habit_checkins_count", sql`${t.count} >= 0`),
  ],
);
export type HabitCheckinRow = typeof HabitCheckins.$inferSelect;

/**
 * The single feed behind the live feed, diary and contribution graph
 * (architecture.md §5). Rows never copy titles, privacy or share flags:
 * readers join the subject for those.
 */
export const Activity = pgTable(
  "activity",
  {
    id: id(),
    /** The actor. */
    userId: userId(),
    kind: activityKind("kind").notNull(),
    subjectType: activitySubject("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** `occurred_at`'s day in the actor's time zone. */
    localDate: date("local_date", { mode: "string" }).notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("activity_user_occurred_idx").on(t.userId, t.occurredAt.desc()),
    index("activity_user_local_date_idx").on(t.userId, t.localDate),
    index("activity_subject_idx").on(t.subjectType, t.subjectId),
  ],
);
export type ActivityRow = typeof Activity.$inferSelect;

export const relations = defineRelations(
  { UserSettings, Tags, Tasks, Habits, HabitPauses, HabitCheckins, Activity },
  () => ({}),
);
