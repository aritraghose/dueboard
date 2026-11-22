import * as Schema from "effect/Schema";
import { Id } from "../core/model.ts";
import { UserColor } from "../tags/model.ts";
import { NOTIFICATION_KIND } from "./notification-constants.ts";

export const CONNECTION_REQUEST_STATUS = ["pending", "accepted", "declined", "cancelled"] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUS)[number];

export const CONNECTION_STATE = [
  "self",
  "none",
  "pending_out",
  "pending_in",
  "connected",
  "blocked",
] as const;
export const ConnectionState = Schema.Literals(CONNECTION_STATE);
export type ConnectionState = typeof ConnectionState.Type;

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 15;
/** Handles issued before the Twitter-style rules ran up to 30 characters; lookups still accept them. */
export const HANDLE_LOOKUP_MAX_LENGTH = 30;
export const CONNECTION_REQUESTS_PER_DAY = 20;
export const PEOPLE_SEARCH_MIN_LENGTH = 2;
export const PEOPLE_SEARCH_LIMIT = 10;
export const PEOPLE_SEARCH_MAX_LENGTH = 60;

export const UsernameInput = Schema.String.check(Schema.isBetweenLength(1, HANDLE_LOOKUP_MAX_LENGTH + 1));

export const UsernameRef = Schema.Struct({ username: UsernameInput });
export type UsernameRef = typeof UsernameRef.Type;

export const ConnectionRequestRef = Schema.Struct({ requestId: Id });
export type ConnectionRequestRef = typeof ConnectionRequestRef.Type;

export const SearchPeopleInput = Schema.Struct({
  query: Schema.String.check(Schema.isMaxLength(PEOPLE_SEARCH_MAX_LENGTH)),
});
export type SearchPeopleInput = typeof SearchPeopleInput.Type;

export class Person extends Schema.Class<Person>("Person")({
  username: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
}) {}

export class Connection extends Schema.Class<Connection>("Connection")({
  person: Person,
  since: Schema.Date,
}) {}

export class ConnectionRequest extends Schema.Class<ConnectionRequest>("ConnectionRequest")({
  id: Schema.String,
  person: Person,
  createdAt: Schema.Date,
}) {}

export class BlockedPerson extends Schema.Class<BlockedPerson>("BlockedPerson")({
  person: Person,
  since: Schema.Date,
}) {}

export class SocialStatus extends Schema.Class<SocialStatus>("SocialStatus")({
  state: ConnectionState,
  requestId: Schema.NullOr(Schema.String),
}) {}

export class PersonResult extends Schema.Class<PersonResult>("PersonResult")({
  person: Person,
  status: SocialStatus,
}) {}

export class ProfileCounts extends Schema.Class<ProfileCounts>("ProfileCounts")({
  connections: Schema.Number,
  points: Schema.Number,
  tasksSettled: Schema.Number,
  habitsCompleted: Schema.Number,
  goalsCompleted: Schema.Number,
  sessionsCompleted: Schema.Number,
}) {}

export class Profile extends Schema.Class<Profile>("Profile")({
  person: Person,
  joinedAt: Schema.Date,
  color: Schema.NullOr(UserColor),
  status: SocialStatus,
  counts: Schema.NullOr(ProfileCounts),
  askEnabled: Schema.Boolean,
}) {}

export class SocialOverview extends Schema.Class<SocialOverview>("SocialOverview")({
  connections: Schema.Array(Connection),
  incoming: Schema.Array(ConnectionRequest),
  outgoing: Schema.Array(ConnectionRequest),
  blocked: Schema.Array(BlockedPerson),
}) {}

export * from "./notification-constants.ts";
export const NotificationKind = Schema.Literals(NOTIFICATION_KIND);
export type NotificationKind = typeof NotificationKind.Type;

export const NotificationState = Schema.Literals(["pending", "accepted", "declined"]);
export type NotificationState = typeof NotificationState.Type;

export class NotificationItem extends Schema.Class<NotificationItem>("NotificationItem")({
  id: Schema.String,
  kind: NotificationKind,
  person: Person,
  requestId: Schema.String,
  state: NotificationState,
  seen: Schema.Boolean,
  createdAt: Schema.Date,
}) {}

export class NotificationsUnseen extends Schema.Class<NotificationsUnseen>("NotificationsUnseen")({
  count: Schema.Number,
}) {}

export class ConnectionRequestNotFound extends Schema.TaggedError<ConnectionRequestNotFound>()(
  "ConnectionRequestNotFound",
  { message: Schema.String, id: Schema.String },
) {}

export const CONNECTION_REFUSAL = ["self", "already_connected", "blocked"] as const;
export type ConnectionRefusal = (typeof CONNECTION_REFUSAL)[number];

export class ConnectionNotAllowed extends Schema.TaggedError<ConnectionNotAllowed>()(
  "ConnectionNotAllowed",
  { message: Schema.String, reason: Schema.Literals(CONNECTION_REFUSAL) },
) {}

export class SocialLimitReached extends Schema.TaggedError<SocialLimitReached>()(
  "SocialLimitReached",
  { message: Schema.String },
) {}
