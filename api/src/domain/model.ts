import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

// The domain's values and typed errors. Pure Schemas with no database code,
// so `../rpc.ts` (which the browser imports) can re-export them, and the
// Drizzle enums in `../schema.ts` are built from the same literal lists.

// ─── Enums ───────────────────────────────────────────────────────────────────

export const PRIVACY = ["public", "connections", "private"] as const;
export const Privacy = Schema.Literals(PRIVACY);
export type Privacy = typeof Privacy.Type;

export const RELAY_POLICY = ["connections", "anyone", "none"] as const;
export const RelayPolicy = Schema.Literals(RELAY_POLICY);
export type RelayPolicy = typeof RelayPolicy.Type;

/** The three tags every user has. Recolorable, but never renamed or deleted. */
export const SYSTEM_TAG_KIND = ["default", "habit", "goal"] as const;
export const SystemTagKind = Schema.Literals(SYSTEM_TAG_KIND);
export type SystemTagKind = typeof SystemTagKind.Type;

/**
 * Tag colors are keys of a small fixed palette, not hex values: the UI maps
 * each key to a light and a dark shade (`--tag-<key>` in `web/src/styles.css`),
 * so every tag stays readable in both themes.
 */
export const TAG_COLOR = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const;
export const TagColor = Schema.Literals(TAG_COLOR);
export type TagColor = typeof TagColor.Type;

/**
 * Each user's color, picked at random from the tag palette when their
 * settings row is created. The timeline shows their username in it. Gray is
 * left out: it reads as muted text, not as a name.
 */
export const USER_COLOR = TAG_COLOR.filter(
  (color): color is Exclude<TagColor, "gray"> => color !== "gray",
);
export const UserColor = Schema.Literals(USER_COLOR);
export type UserColor = typeof UserColor.Type;

/** What every activity row can record. See architecture.md §5. */
export const ACTIVITY_KIND = [
  "task_settled",
  "habit_completed",
  "goal_progressed",
  "goal_completed",
  "session_started",
  "session_completed",
  "session_stopped",
  "note_created",
] as const;
export type ActivityKind = (typeof ACTIVITY_KIND)[number];

export const ACTIVITY_SUBJECT = ["task", "habit", "goal", "session", "note"] as const;
export type ActivitySubject = (typeof ACTIVITY_SUBJECT)[number];

// ─── Limits ──────────────────────────────────────────────────────────────────

export const TAG_NAME_MAX_LENGTH = 30;
/** Per user, the system tags included. */
export const MAX_TAGS_PER_USER = 50;
/** IANA names are far shorter; this only bounds the request body. */
export const TIME_ZONE_MAX_LENGTH = 64;

/** A tag name: trimmed, 1–30 characters. */
export const TagName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, TAG_NAME_MAX_LENGTH),
);

// ─── Inputs ──────────────────────────────────────────────────────────────────
// The RPCs use these as payloads, and the services decode them again, since
// Tibo's tools (step 18) call the services without going through an RPC.

/** Ids are UUIDs; this only bounds the request body. */
export const Id = Schema.String.check(Schema.isBetweenLength(1, 64));

export const SettingsPatch = Schema.Struct({
  defaultPrivacy: Schema.optionalKey(Privacy),
  defaultShareToTimeline: Schema.optionalKey(Schema.Boolean),
  relayPolicy: Schema.optionalKey(RelayPolicy),
});
export type SettingsPatch = typeof SettingsPatch.Type;

export const CreateTagInput = Schema.Struct({ name: TagName, color: TagColor });
export type CreateTagInput = typeof CreateTagInput.Type;

/** Omitted fields are left as they are. System tags accept `color` only. */
export const UpdateTagInput = Schema.Struct({
  id: Id,
  name: Schema.optionalKey(TagName),
  color: Schema.optionalKey(TagColor),
});
export type UpdateTagInput = typeof UpdateTagInput.Type;

/** Decodes a service's input, failing with {@link InvalidInput}. */
export const decodeInput =
  <S extends Schema.Decoder<unknown>>(schema: S) =>
  (input: unknown): Effect.Effect<S["Type"], InvalidInput, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message })),
    );

// ─── Values ──────────────────────────────────────────────────────────────────

/** The settings a user can see and change. `aiQuotaOverride` stays server-side. */
export class Settings extends Schema.Class<Settings>("Settings")({
  timeZone: Schema.String,
  /** Assigned once at random; not user-editable yet. */
  color: UserColor,
  defaultPrivacy: Privacy,
  defaultShareToTimeline: Schema.Boolean,
  relayPolicy: RelayPolicy,
}) {}

export class Tag extends Schema.Class<Tag>("Tag")({
  id: Schema.String,
  name: Schema.String,
  color: TagColor,
  /** Set on the three system tags, `null` on the user's own. */
  systemKind: Schema.NullOr(SystemTagKind),
  createdAt: Schema.Date,
}) {}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Input that fails a rule its Schema can't express, or that skipped the RPC decode (Tibo). */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("InvalidInput", {
  message: Schema.String,
}) {}

export class TagNotFound extends Schema.TaggedError<TagNotFound>()("TagNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class TagNameTaken extends Schema.TaggedError<TagNameTaken>()("TagNameTaken", {
  message: Schema.String,
  name: Schema.String,
}) {}

export class TagLimitReached extends Schema.TaggedError<TagLimitReached>()("TagLimitReached", {
  message: Schema.String,
  limit: Schema.Number,
}) {}

/** Renaming or deleting a system tag. */
export class SystemTagLocked extends Schema.TaggedError<SystemTagLocked>()("SystemTagLocked", {
  message: Schema.String,
  id: Schema.String,
}) {}
