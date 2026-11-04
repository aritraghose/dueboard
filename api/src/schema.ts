import { defineRelations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  ACTIVITY_KIND,
  AI_USAGE_REASON,
  ASK_ANSWER_MAX_LENGTH,
  ASK_DOCUMENT_MAX_LENGTH,
  ASK_DOCUMENT_NAME_MAX_LENGTH,
  ASK_INSTRUCTIONS_MAX_LENGTH,
  ASK_MONTHLY_ANSWER_CAP_DEFAULT,
  ASK_MONTHLY_ANSWER_CAP_MAX,
  ASK_QUESTION_MAX_LENGTH,
  ASK_SHARED_CONTEXT_MAX_LENGTH,
  ACTIVITY_SUBJECT,
  CONNECTION_REQUEST_STATUS,
  GOAL_COUNT_MAX,
  GOAL_DESCRIPTION_MAX_LENGTH,
  GOAL_LINK_AMOUNT_MAX,
  GOAL_LINK_ITEM,
  GOAL_NAME_MAX_LENGTH,
  GOAL_PROGRESS_MODE,
  GOAL_PROGRESS_SOURCE,
  GOAL_STATUS,
  HABIT_DESCRIPTION_MAX_LENGTH,
  HABIT_PERIOD_LENGTH_MAX,
  HABIT_PERIOD_UNIT,
  HABIT_SCHEDULE_KIND,
  HABIT_STATUS,
  HABIT_TARGET_MAX,
  HABIT_TITLE_MAX_LENGTH,
  NOTE_BODY_MAX_LENGTH,
  NOTIFICATION_KIND,
  PRIVACY,
  RELAY_MESSAGE_MAX_LENGTH,
  RELAY_POLICY,
  RELAY_STATUS,
  SESSION_LABEL_MAX_LENGTH,
  SESSION_MINUTES_MAX,
  SESSION_STATUS,
  SYSTEM_TAG_KIND,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_EXPECTED_MINUTES_MAX,
  TASK_IMPORTANCE_MAX,
  TASK_STATUS,
  TASK_TITLE_MAX_LENGTH,
  TIBO_EVENING_TIMES,
  TIBO_EVENING_TIME_DEFAULT,
  TIBO_EVENT_KIND,
  TIBO_MORNING_TIMES,
  TIBO_MORNING_TIME_DEFAULT,
  USER_COLOR,
  type TagColor,
  type TiboEveningTime,
  type TiboEventKind,
  type TiboMorningTime,
  type UserColor,
} from "./domain/model.ts";
import type { LocalDate } from "./domain/dates.ts";

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
export const goalProgressMode = pgEnum("goal_progress_mode", GOAL_PROGRESS_MODE);
export const goalStatus = pgEnum("goal_status", GOAL_STATUS);
export const goalLinkItem = pgEnum("goal_link_item", GOAL_LINK_ITEM);
export const goalProgressSource = pgEnum("goal_progress_source", GOAL_PROGRESS_SOURCE);
export const focusSessionStatus = pgEnum("focus_session_status", SESSION_STATUS);
export const aiUsageReason = pgEnum("ai_usage_reason", AI_USAGE_REASON);
export const connectionRequestStatus = pgEnum(
  "connection_request_status",
  CONNECTION_REQUEST_STATUS,
);

export const UserSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  timeZone: text("time_zone").notNull(),
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
  aiQuotaOverride: integer("ai_quota_override"),
  tiboProactive: boolean("tibo_proactive").notNull().default(true),
  tiboMorningPlan: boolean("tibo_morning_plan").notNull().default(true),
  tiboMorningTime: text("tibo_morning_time").$type<TiboMorningTime>().notNull().default(TIBO_MORNING_TIME_DEFAULT),
  tiboDeadlineNudges: boolean("tibo_deadline_nudges").notNull().default(true),
  tiboHabitCheck: boolean("tibo_habit_check").notNull().default(true),
  tiboEveningTime: text("tibo_evening_time").$type<TiboEveningTime>().notNull().default(TIBO_EVENING_TIME_DEFAULT),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  check(
    "user_settings_tibo_morning_time",
    sql`${t.tiboMorningTime} in (${sql.raw(TIBO_MORNING_TIMES.map((time) => `'${time}'`).join(", "))})`,
  ),
  check(
    "user_settings_tibo_evening_time",
    sql`${t.tiboEveningTime} in (${sql.raw(TIBO_EVENING_TIMES.map((time) => `'${time}'`).join(", "))})`,
  ),
]);
export type UserSettingsRow = typeof UserSettings.$inferSelect;

export const Tags = pgTable(
  "tags",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    color: text("color").$type<TagColor>().notNull(),
    systemKind: systemTagKind("system_kind"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tags_user_name_idx").on(t.userId, sql`lower(${t.name})`),
    uniqueIndex("tags_user_system_kind_idx")
      .on(t.userId, t.systemKind)
      .where(sql`${t.systemKind} is not null`),
  ],
);
export type TagRow = typeof Tags.$inferSelect;

export const Tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    description: text("description"),
    assignedDate: date("assigned_date", { mode: "string" }).$type<LocalDate>(),
    deadlineDate: date("deadline_date", { mode: "string" }).$type<LocalDate>(),
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

export const Habits = pgTable(
  "habits",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    description: text("description"),
    scheduleKind: habitScheduleKind("schedule_kind").notNull(),
    targetCount: smallint("target_count").notNull(),
    periodUnit: habitPeriodUnit("period_unit").notNull(),
    periodLength: smallint("period_length").notNull(),
    weekdays: smallint("weekdays").array(),
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
    index("habit_checkins_points_idx").on(t.localDate, t.userId).where(sql`${t.count} > 0`),
    check("habit_checkins_count", sql`${t.count} >= 0`),
  ],
);
export type HabitCheckinRow = typeof HabitCheckins.$inferSelect;

export const Goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    description: text("description"),
    progressMode: goalProgressMode("progress_mode").notNull(),
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    targetCount: integer("target_count"),
    currentCount: integer("current_count"),
    targetDate: date("target_date", { mode: "string" }).$type<LocalDate>(),
    status: goalStatus("status").notNull().default("active"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    privacy: privacy("privacy").notNull(),
    shareToLive: boolean("share_to_live").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("goals_user_status_idx").on(t.userId, t.status),
    index("goals_user_created_idx").on(t.userId, t.createdAt, t.id),
    check(
      "goals_name_length",
      sql`char_length(${t.name}) between 1 and ${sql.raw(String(GOAL_NAME_MAX_LENGTH))}`,
    ),
    check(
      "goals_description_length",
      sql`char_length(${t.description}) <= ${sql.raw(String(GOAL_DESCRIPTION_MAX_LENGTH))}`,
    ),
    check("goals_percent_range", sql`${t.progressPercent} between 0 and 100`),
    check(
      "goals_progress_shape",
      sql`(${t.progressMode} = 'slider' and ${t.targetCount} is null and ${t.currentCount} is null)
        or (${t.progressMode} = 'count'
          and ${t.targetCount} between 1 and ${sql.raw(String(GOAL_COUNT_MAX))}
          and ${t.currentCount} between 0 and ${sql.raw(String(GOAL_COUNT_MAX))})`,
    ),
    check("goals_completed_at", sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`),
    check(
      "goals_completed_reached",
      sql`${t.status} <> 'completed' or (case ${t.progressMode}
        when 'slider' then ${t.progressPercent} = 100
        else ${t.currentCount} >= ${t.targetCount} end)`,
    ),
  ],
);
export type GoalRow = typeof Goals.$inferSelect;

export const GoalLinks = pgTable(
  "goal_links",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => Goals.id, { onDelete: "cascade" }),
    userId: userId(),
    itemType: goalLinkItem("item_type").notNull(),
    itemId: text("item_id").notNull(),
    amount: integer("amount").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("goal_links_goal_item_idx").on(t.goalId, t.itemType, t.itemId),
    index("goal_links_user_item_idx").on(t.userId, t.itemType, t.itemId),
    check(
      "goal_links_amount_range",
      sql`${t.amount} between 1 and ${sql.raw(String(GOAL_LINK_AMOUNT_MAX))}`,
    ),
  ],
);
export type GoalLinkRow = typeof GoalLinks.$inferSelect;

export const GoalProgressEvents = pgTable(
  "goal_progress_events",
  {
    id: id(),
    goalId: text("goal_id")
      .notNull()
      .references(() => Goals.id, { onDelete: "cascade" }),
    userId: userId(),
    delta: numeric("delta", { precision: 12, scale: 2, mode: "number" }).notNull(),
    valueAfter: numeric("value_after", { precision: 12, scale: 2, mode: "number" }).notNull(),
    source: goalProgressSource("source").notNull(),
    sourceId: text("source_id"),
    sourceDate: date("source_date", { mode: "string" }).$type<LocalDate>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("goal_progress_events_goal_idx").on(t.goalId, t.createdAt.desc(), t.id.desc()),
    index("goal_progress_events_source_idx").on(t.goalId, t.source, t.sourceId),
    index("goal_progress_events_user_idx").on(t.userId, t.createdAt),
    check("goal_progress_events_delta", sql`${t.delta} <> 0`),
    check(
      "goal_progress_events_source_id",
      sql`(${t.source} = 'manual') = (${t.sourceId} is null)`,
    ),
  ],
);
export type GoalProgressEventRow = typeof GoalProgressEvents.$inferSelect;

export const Notes = pgTable(
  "notes",
  {
    id: id(),
    userId: userId(),
    body: text("body").notNull(),
    localDate: date("local_date", { mode: "string" }).$type<LocalDate>().notNull(),
    privacy: privacy("privacy").notNull(),
    shareToLive: boolean("share_to_live").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("notes_user_local_date_idx").on(t.userId, t.localDate, t.createdAt, t.id),
    check(
      "notes_body_length",
      sql`char_length(${t.body}) between 1 and ${sql.raw(String(NOTE_BODY_MAX_LENGTH))}`,
    ),
  ],
);
export type NoteRow = typeof Notes.$inferSelect;

export const FocusSessions = pgTable(
  "focus_sessions",
  {
    id: id(),
    userId: userId(),
    label: text("label"),
    plannedMinutes: integer("planned_minutes").notNull(),
    status: focusSessionStatus("status").notNull(),
    localDate: date("local_date", { mode: "string" }).$type<LocalDate>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    privacy: privacy("privacy").notNull(),
    shareToLive: boolean("share_to_live").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("focus_sessions_one_active_idx")
      .on(t.userId)
      .where(sql`${t.status} in ('running', 'paused')`),
    index("focus_sessions_user_local_date_idx").on(t.userId, t.localDate, t.startedAt, t.id),
    index("focus_sessions_expiry_idx").on(t.endsAt).where(sql`${t.status} = 'running'`),
    check(
      "focus_sessions_label_length",
      sql`${t.label} is null or char_length(${t.label}) between 1 and ${sql.raw(String(SESSION_LABEL_MAX_LENGTH))}`,
    ),
    check(
      "focus_sessions_planned_minutes",
      sql`${t.plannedMinutes} between 1 and ${sql.raw(String(SESSION_MINUTES_MAX))}`,
    ),
    check("focus_sessions_ends_at", sql`(${t.status} = 'running') = (${t.endsAt} is not null)`),
    check(
      "focus_sessions_ended_at",
      sql`(${t.status} in ('completed', 'stopped')) = (${t.endedAt} is not null)`,
    ),
  ],
);
export type FocusSessionRow = typeof FocusSessions.$inferSelect;

export const FocusSessionSegments = pgTable(
  "focus_session_segments",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => FocusSessions.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("focus_session_segments_session_idx").on(t.sessionId, t.startedAt),
    uniqueIndex("focus_session_segments_open_idx")
      .on(t.sessionId)
      .where(sql`${t.endedAt} is null`),
    check(
      "focus_session_segments_order",
      sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`,
    ),
  ],
);
export type FocusSessionSegmentRow = typeof FocusSessionSegments.$inferSelect;

export const Activity = pgTable(
  "activity",
  {
    id: id(),
    userId: userId(),
    kind: activityKind("kind").notNull(),
    subjectType: activitySubject("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("activity_user_occurred_idx").on(t.userId, t.occurredAt.desc()),
    index("activity_user_local_date_idx").on(t.userId, t.localDate),
    index("activity_subject_idx").on(t.subjectType, t.subjectId),
    index("activity_points_idx")
      .on(t.localDate, t.userId)
      .where(sql`${t.kind} in ('task_settled', 'goal_progressed', 'session_completed')`),
  ],
);
export type ActivityRow = typeof Activity.$inferSelect;

export const ConnectionRequests = pgTable(
  "connection_requests",
  {
    id: id(),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    status: connectionRequestStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("connection_requests_pending_idx")
      .on(t.fromUserId, t.toUserId)
      .where(sql`${t.status} = 'pending'`),
    index("connection_requests_from_idx").on(t.fromUserId, t.createdAt),
    index("connection_requests_to_idx").on(t.toUserId, t.status, t.createdAt),
    check("connection_requests_not_self", sql`${t.fromUserId} <> ${t.toUserId}`),
    check(
      "connection_requests_responded_at",
      sql`(${t.status} = 'pending') = (${t.respondedAt} is null)`,
    ),
  ],
);
export type ConnectionRequestRow = typeof ConnectionRequests.$inferSelect;

export const Connections = pgTable(
  "connections",
  {
    userLow: text("user_low").notNull(),
    userHigh: text("user_high").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userLow, t.userHigh] }),
    index("connections_user_high_idx").on(t.userHigh),
    check("connections_order", sql`${t.userLow} < ${t.userHigh} collate "C"`),
  ],
);
export type ConnectionRow = typeof Connections.$inferSelect;

export const Blocks = pgTable(
  "blocks",
  {
    blockerId: text("blocker_id").notNull(),
    blockedId: text("blocked_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index("blocks_blocked_idx").on(t.blockedId),
    check("blocks_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);
export type BlockRow = typeof Blocks.$inferSelect;

export const notificationKind = pgEnum("notification_kind", NOTIFICATION_KIND);

export const Notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: userId(),
    actorId: text("actor_id").notNull(),
    kind: notificationKind("kind").notNull(),
    requestId: text("request_id")
      .notNull()
      .references(() => ConnectionRequests.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    index("notifications_unseen_idx").on(t.userId).where(sql`${t.seenAt} is null`),
    index("notifications_actor_idx").on(t.actorId),
    uniqueIndex("notifications_request_kind_idx").on(t.requestId, t.kind),
    check("notifications_not_self", sql`${t.userId} <> ${t.actorId}`),
  ],
);
export type NotificationRow = typeof Notifications.$inferSelect;

export const AiUsageTotals = pgTable(
  "ai_usage",
  {
    userId: text("user_id").notNull(),
    period: text("period").notNull(),
    units: integer("units").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.period] }),
    check("ai_usage_units", sql`${t.units} >= 0`),
  ],
);
export type AiUsageTotalRow = typeof AiUsageTotals.$inferSelect;

export const AiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: id(),
    userId: userId(),
    units: integer("units").notNull(),
    reason: aiUsageReason("reason").notNull(),
    ref: text("ref"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_usage_events_user_created_idx").on(t.userId, t.createdAt),
    check("ai_usage_events_units", sql`${t.units} > 0`),
  ],
);
export type AiUsageEventRow = typeof AiUsageEvents.$inferSelect;

export const relayStatus = pgEnum("relay_status", RELAY_STATUS);

export const Relays = pgTable(
  "relays",
  {
    id: id(),
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id").notNull(),
    message: text("message").notNull(),
    status: relayStatus("status").notNull().default("pending"),
    answer: text("answer"),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    senderSynced: boolean("sender_synced").notNull().default(true),
    recipientSynced: boolean("recipient_synced").notNull().default(false),
    retryAt: timestamp("retry_at", { withTimezone: true }),
  },
  (t) => [
    index("relays_from_idx").on(t.fromUserId, t.createdAt),
    index("relays_to_idx").on(t.toUserId, t.status, t.createdAt),
    index("relays_open_expires_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} in ('pending', 'delivered')`),
    index("relays_unsynced_idx")
      .on(t.updatedAt)
      .where(sql`not ${t.senderSynced} or not ${t.recipientSynced}`),
    check("relays_not_self", sql`${t.fromUserId} <> ${t.toUserId}`),
    check(
      "relays_message_length",
      sql`char_length(${t.message}) between 1 and ${sql.raw(String(RELAY_MESSAGE_MAX_LENGTH))}`,
    ),
    check(
      "relays_answer",
      sql`(${t.status} = 'answered') = (${t.answer} is not null) and (${t.answer} is null or char_length(${t.answer}) between 1 and ${sql.raw(String(RELAY_MESSAGE_MAX_LENGTH))})`,
    ),
    check("relays_answered_at", sql`(${t.status} in ('answered', 'declined')) = (${t.answeredAt} is not null)`),
    check(
      "relays_delivered_at",
      sql`${t.status} not in ('delivered', 'answered', 'declined') or ${t.deliveredAt} is not null`,
    ),
  ],
);
export type RelayRow = typeof Relays.$inferSelect;

export const TiboWipes = pgTable("tibo_wipes", {
  userId: text("user_id").primaryKey(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
});

export const TiboEvents = pgTable(
  "tibo_events",
  {
    id: id(),
    userId: userId(),
    kind: text("kind").$type<TiboEventKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("tibo_events_created_at_idx").on(t.createdAt),
    check("tibo_events_kind", sql`${t.kind} in (${sql.raw(TIBO_EVENT_KIND.map((kind) => `'${kind}'`).join(", "))})`),
  ],
);

export const AskSettingsTable = pgTable(
  "ask_settings",
  {
    userId: text("user_id").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    instructions: text("instructions").notNull().default(""),
    sharedContext: text("shared_context").notNull().default(""),
    monthlyAnswerCap: integer("monthly_answer_cap").notNull().default(ASK_MONTHLY_ANSWER_CAP_DEFAULT),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("ask_settings_instructions_length", sql`char_length(${t.instructions}) <= ${sql.raw(String(ASK_INSTRUCTIONS_MAX_LENGTH))}`),
    check(
      "ask_settings_shared_context_length",
      sql`char_length(${t.sharedContext}) <= ${sql.raw(String(ASK_SHARED_CONTEXT_MAX_LENGTH))}`,
    ),
    check(
      "ask_settings_monthly_answer_cap",
      sql`${t.monthlyAnswerCap} between 1 and ${sql.raw(String(ASK_MONTHLY_ANSWER_CAP_MAX))}`,
    ),
  ],
);
export type AskSettingsRow = typeof AskSettingsTable.$inferSelect;

export const AskUsage = pgTable(
  "ask_usage",
  {
    userId: text("user_id").notNull(),
    period: text("period").notNull(),
    answers: integer("answers").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period] }), check("ask_usage_answers", sql`${t.answers} >= 0`)],
);

export const AskQuestions = pgTable(
  "ask_questions",
  {
    id: id(),
    userId: userId(),
    askerId: text("asker_id"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ask_questions_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("ask_questions_created_idx").on(t.createdAt),
    index("ask_questions_asker_idx").on(t.askerId),
    check("ask_questions_question_length", sql`char_length(${t.question}) between 1 and ${sql.raw(String(ASK_QUESTION_MAX_LENGTH))}`),
    check("ask_questions_answer_length", sql`char_length(${t.answer}) <= ${sql.raw(String(ASK_ANSWER_MAX_LENGTH))}`),
  ],
);
export type AskQuestionRow = typeof AskQuestions.$inferSelect;

export const AskDocuments = pgTable(
  "ask_documents",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ask_documents_user_created_idx").on(t.userId, t.createdAt),
    check("ask_documents_name_length", sql`char_length(${t.name}) between 1 and ${sql.raw(String(ASK_DOCUMENT_NAME_MAX_LENGTH))}`),
    check("ask_documents_text_length", sql`char_length(${t.text}) between 1 and ${sql.raw(String(ASK_DOCUMENT_MAX_LENGTH))}`),
  ],
);

export const relations = defineRelations(
  {
    UserSettings,
    Tags,
    Tasks,
    Habits,
    HabitPauses,
    HabitCheckins,
    Goals,
    GoalLinks,
    GoalProgressEvents,
    Notes,
    FocusSessions,
    FocusSessionSegments,
    Activity,
    ConnectionRequests,
    Connections,
    Blocks,
    Notifications,
    AiUsageTotals,
    AiUsageEvents,
    Relays,
    AskSettingsTable,
    AskUsage,
    AskQuestions,
    AskDocuments,
  },
  () => ({}),
);
