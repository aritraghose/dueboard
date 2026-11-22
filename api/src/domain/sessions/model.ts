import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Id, Privacy } from "../core/model.ts";

export const SESSION_STATUS = ["running", "paused", "completed", "stopped"] as const;
export const SessionStatus = Schema.Literals(SESSION_STATUS);
export type SessionStatus = typeof SessionStatus.Type;

export const SESSION_ACTION = ["pause", "resume", "extend", "stop"] as const;
export type SessionAction = (typeof SESSION_ACTION)[number];

export const SESSION_LABEL_MAX_LENGTH = 100;
export const SESSION_MINUTES_MAX = 600;
export const SESSION_PAGE_SIZE_DEFAULT = 30;
export const SESSION_PAGE_SIZE_MAX = 100;
export const SESSION_CURSOR_MAX_LENGTH = 160;

export const SessionMinutes = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_MINUTES_MAX }));

export const SessionLabel = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, SESSION_LABEL_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A label is a single line"),
);

export const StartSessionInput = Schema.Struct({
  minutes: SessionMinutes,
  label: Schema.optionalKey(SessionLabel),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
  replaceActive: Schema.optionalKey(Schema.Boolean),
});
export type StartSessionInput = typeof StartSessionInput.Type;

export const ExtendSessionInput = Schema.Struct({ id: Id, minutes: SessionMinutes });
export type ExtendSessionInput = typeof ExtendSessionInput.Type;

export const ListSessionsInput = Schema.Struct({
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(SESSION_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_PAGE_SIZE_MAX }))),
});
export type ListSessionsInput = typeof ListSessionsInput.Type;

export class FocusSession extends Schema.Class<FocusSession>("FocusSession")({
  id: Schema.String,
  label: Schema.NullOr(Schema.String),
  plannedMinutes: Schema.Number,
  status: SessionStatus,
  localDate: LocalDate,
  startedAt: Schema.Date,
  endsAt: Schema.NullOr(Schema.Date),
  endedAt: Schema.NullOr(Schema.Date),
  elapsedMs: Schema.Number,
  remainingMs: Schema.Number,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class SessionsForDay extends Schema.Class<SessionsForDay>("SessionsForDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

export class SessionDay extends Schema.Class<SessionDay>("SessionDay")({
  date: LocalDate,
  focusedMinutes: Schema.Number,
  sessions: Schema.Array(FocusSession),
}) {}

export class SessionPage extends Schema.Class<SessionPage>("SessionPage")({
  days: Schema.Array(SessionDay),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class ActiveSessionExists extends Schema.TaggedError<ActiveSessionExists>()("ActiveSessionExists", {
  message: Schema.String,
  session: FocusSession,
}) {}

export class SessionTransitionNotAllowed extends Schema.TaggedError<SessionTransitionNotAllowed>()(
  "SessionTransitionNotAllowed",
  {
    message: Schema.String,
    status: SessionStatus,
  },
) {}
