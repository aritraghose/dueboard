import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Id, Privacy } from "../core/model.ts";
import { MAX_TAGS_PER_USER } from "../tags/model.ts";

export const TASK_STATUS = ["idle", "working", "settled"] as const;
export const TaskStatus = Schema.Literals(TASK_STATUS);
export type TaskStatus = typeof TaskStatus.Type;

export const TASK_DATE_ROLE = ["assigned", "deadline", "both"] as const;
export const TaskDateRole = Schema.Literals(TASK_DATE_ROLE);
export type TaskDateRole = typeof TaskDateRole.Type;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
export const TASK_IMPORTANCE_MAX = 5;
export const TASK_EXPECTED_MINUTES_MAX = 1440;
export const TASK_SEARCH_MAX_LENGTH = 200;
export const TASK_PAGE_SIZE_DEFAULT = 50;
export const TASK_PAGE_SIZE_MAX = 100;
export const TASK_CURSOR_MAX_LENGTH = 128;

export const TaskTitle = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, TASK_TITLE_MAX_LENGTH),
);
export const TaskDescription = Schema.String.check(Schema.isMaxLength(TASK_DESCRIPTION_MAX_LENGTH));
export const TaskImportance = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: TASK_IMPORTANCE_MAX }));
export const TaskExpectedMinutes = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: TASK_EXPECTED_MINUTES_MAX }),
);

export const CreateTaskInput = Schema.Struct({
  title: TaskTitle,
  description: Schema.optionalKey(Schema.NullOr(TaskDescription)),
  assignedDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  deadlineDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  tagId: Schema.optionalKey(Id),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  importance: Schema.optionalKey(Schema.NullOr(TaskImportance)),
  expectedMinutes: Schema.optionalKey(Schema.NullOr(TaskExpectedMinutes)),
});
export type CreateTaskInput = typeof CreateTaskInput.Type;

export const UpdateTaskInput = Schema.Struct({
  id: Id,
  title: Schema.optionalKey(TaskTitle),
  description: Schema.optionalKey(Schema.NullOr(TaskDescription)),
  assignedDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  deadlineDate: Schema.optionalKey(Schema.NullOr(LocalDate)),
  tagId: Schema.optionalKey(Id),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  importance: Schema.optionalKey(Schema.NullOr(TaskImportance)),
  expectedMinutes: Schema.optionalKey(Schema.NullOr(TaskExpectedMinutes)),
});
export type UpdateTaskInput = typeof UpdateTaskInput.Type;

export const SetTaskStatusInput = Schema.Struct({ id: Id, status: TaskStatus });
export type SetTaskStatusInput = typeof SetTaskStatusInput.Type;

export const ListUnscheduledTasksInput = Schema.Struct({
  settledOn: Schema.optionalKey(LocalDate),
});
export type ListUnscheduledTasksInput = typeof ListUnscheduledTasksInput.Type;

export const ListTasksInput = Schema.Struct({
  status: Schema.optionalKey(
    Schema.Array(TaskStatus).check(Schema.isMaxLength(TASK_STATUS.length)),
  ),
  tagIds: Schema.optionalKey(Schema.Array(Id).check(Schema.isMaxLength(MAX_TAGS_PER_USER))),
  from: Schema.optionalKey(LocalDate),
  to: Schema.optionalKey(LocalDate),
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(TASK_SEARCH_MAX_LENGTH))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(TASK_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: TASK_PAGE_SIZE_MAX }))),
});
export type ListTasksInput = typeof ListTasksInput.Type;

export class Task extends Schema.Class<Task>("Task")({
  id: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  assignedDate: Schema.NullOr(LocalDate),
  deadlineDate: Schema.NullOr(LocalDate),
  tagId: Schema.String,
  status: TaskStatus,
  settledAt: Schema.NullOr(Schema.Date),
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  importance: Schema.NullOr(Schema.Number),
  expectedMinutes: Schema.NullOr(Schema.Number),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class DayTask extends Schema.Class<DayTask>("DayTask")({
  task: Task,
  role: TaskDateRole,
}) {}

export class TasksForDay extends Schema.Class<TasksForDay>("TasksForDay")({
  date: LocalDate,
  open: Schema.Array(DayTask),
  settled: Schema.Array(DayTask),
}) {}

export class UnscheduledTasks extends Schema.Class<UnscheduledTasks>("UnscheduledTasks")({
  open: Schema.Array(Task),
  settled: Schema.Array(Task),
}) {}

export class TaskPage extends Schema.Class<TaskPage>("TaskPage")({
  tasks: Schema.Array(Task),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class TaskNotFound extends Schema.TaggedError<TaskNotFound>()("TaskNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}
