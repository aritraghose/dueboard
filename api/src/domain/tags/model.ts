import * as Schema from "effect/Schema";
import { Id } from "../core/model.ts";

export const SYSTEM_TAG_KIND = ["default", "habit", "goal"] as const;
export const SystemTagKind = Schema.Literals(SYSTEM_TAG_KIND);
export type SystemTagKind = typeof SystemTagKind.Type;

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

export const USER_COLOR = TAG_COLOR.filter((color): color is Exclude<TagColor, "gray"> => color !== "gray");
export const UserColor = Schema.Literals(USER_COLOR);
export type UserColor = typeof UserColor.Type;

export const TAG_NAME_MAX_LENGTH = 30;
export const MAX_TAGS_PER_USER = 50;

export const TagName = Schema.String.check(Schema.isTrimmed(), Schema.isBetweenLength(1, TAG_NAME_MAX_LENGTH));

export const CreateTagInput = Schema.Struct({ name: TagName, color: TagColor });
export type CreateTagInput = typeof CreateTagInput.Type;

export const UpdateTagInput = Schema.Struct({
  id: Id,
  name: Schema.optionalKey(TagName),
  color: Schema.optionalKey(TagColor),
});
export type UpdateTagInput = typeof UpdateTagInput.Type;

export class Tag extends Schema.Class<Tag>("Tag")({
  id: Schema.String,
  name: Schema.String,
  color: TagColor,
  systemKind: Schema.NullOr(SystemTagKind),
  createdAt: Schema.Date,
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

export class SystemTagLocked extends Schema.TaggedError<SystemTagLocked>()("SystemTagLocked", {
  message: Schema.String,
  id: Schema.String,
}) {}
