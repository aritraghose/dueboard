import { and, asc, count, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Tags, UserSettings, type TagRow } from "../schema.ts";
import {
  Database,
  isUniqueViolation,
  newId,
  orDieOnDbError,
  transaction,
  type Executor,
} from "./database.ts";
import {
  CreateTagInput,
  MAX_TAGS_PER_USER,
  SystemTagLocked,
  Tag,
  TagLimitReached,
  TagNameTaken,
  TagNotFound,
  UpdateTagInput,
  decodeInput,
  type SystemTagKind,
  type TagColor,
} from "./model.ts";

// The user's tags. Every user has three system tags (`default`, `habit`,
// `goal`), seeded by `ensureUserSetup`: they can be recolored but never
// renamed or deleted. Names are unique per user, ignoring case.

/** The system tags, as `ensureUserSetup` seeds them. */
export const SYSTEM_TAGS: ReadonlyArray<{
  readonly kind: SystemTagKind;
  readonly name: string;
  readonly color: TagColor;
}> = [
  { kind: "default", name: "default", color: "gray" },
  { kind: "habit", name: "habit", color: "green" },
  { kind: "goal", name: "goal", color: "violet" },
];

export const toTag = (row: TagRow): Tag =>
  new Tag({
    id: row.id,
    name: row.name,
    color: row.color,
    systemKind: row.systemKind,
    createdAt: row.createdAt,
  });

const nameTaken = (name: string) =>
  new TagNameTaken({ message: `You already have a tag named "${name}".`, name });

const findTag = (tx: Executor, userId: string, id: string) =>
  Effect.gen(function* () {
    const [row] = yield* tx
      .select()
      .from(Tags)
      .where(and(eq(Tags.id, id), eq(Tags.userId, userId)));
    if (!row) return yield* new TagNotFound({ message: "That tag no longer exists.", id });
    return row;
  });

/**
 * Serializes a user's tag writes by locking their settings row, so two
 * concurrent creates can't both pass the per-user limit.
 */
const lockUser = (tx: Executor, userId: string) =>
  tx
    .select({ userId: UserSettings.userId })
    .from(UserSettings)
    .where(eq(UserSettings.userId, userId))
    .for("update");

/** The user's tags, oldest first (the system tags lead). */
export const listTags = Effect.fn("listTags")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Tags)
    .where(eq(Tags.userId, userId))
    .orderBy(asc(Tags.createdAt), asc(Tags.name))
    .pipe(orDieOnDbError);
  return rows.map(toTag);
});

export const createTag = Effect.fn("createTag")(function* (userId: string, input: CreateTagInput) {
  const { name, color } = yield* decodeInput(CreateTagInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* lockUser(tx, userId);
      const [{ total } = { total: 0 }] = yield* tx
        .select({ total: count() })
        .from(Tags)
        .where(eq(Tags.userId, userId));
      if (total >= MAX_TAGS_PER_USER) {
        return yield* new TagLimitReached({
          message: `You can have up to ${MAX_TAGS_PER_USER} tags. Delete one to add another.`,
          limit: MAX_TAGS_PER_USER,
        });
      }
      // A clash with the unique `(user_id, lower(name))` index inserts nothing.
      const [row] = yield* tx
        .insert(Tags)
        .values({ id: newId(), userId, name, color })
        .onConflictDoNothing()
        .returning();
      if (!row) return yield* nameTaken(name);
      return toTag(row);
    }),
  );
});

/** Renames and/or recolors a tag. A system tag can only be recolored. */
export const updateTag = Effect.fn("updateTag")(function* (userId: string, input: UpdateTagInput) {
  const { id, name, color } = yield* decodeInput(UpdateTagInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const tag = yield* findTag(tx, userId, id);
      const rename = name !== undefined && name !== tag.name;
      if (rename && tag.systemKind) {
        return yield* new SystemTagLocked({
          message: `The "${tag.name}" tag can't be renamed.`,
          id,
        });
      }
      if (!rename && (color === undefined || color === tag.color)) return toTag(tag);
      const [row] = yield* tx
        .update(Tags)
        .set({ ...(rename && { name }), ...(color && { color }) })
        .where(and(eq(Tags.id, id), eq(Tags.userId, userId)))
        .returning()
        .pipe(
          Effect.catchIf(isUniqueViolation, () => Effect.fail(nameTaken(name ?? tag.name))),
        );
      return toTag(row!);
    }),
  );
});

/**
 * Moves everything tagged `fromTagId` onto the user's `default` tag, before
 * that tag is deleted.
 *
 * TODO(step 3): reassign the tag's tasks (`UPDATE tasks SET tag_id = toTagId
 * WHERE user_id = userId AND tag_id = fromTagId`). Every later table with a
 * `tag_id` gets reassigned here too.
 */
const reassignTagItems = (_tx: Executor, _userId: string, _fromTagId: string, _toTagId: string) =>
  Effect.void;

/** Deletes one of the user's own tags; its items move to `default`. Returns the id. */
export const deleteTag = Effect.fn("deleteTag")(function* (userId: string, id: string) {
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const tag = yield* findTag(tx, userId, id);
      if (tag.systemKind) {
        return yield* new SystemTagLocked({
          message: `The "${tag.name}" tag can't be deleted.`,
          id,
        });
      }
      const [fallback] = yield* tx
        .select({ id: Tags.id })
        .from(Tags)
        .where(and(eq(Tags.userId, userId), eq(Tags.systemKind, "default")));
      // `ensureUserSetup` always seeds it, so this is a broken invariant.
      if (!fallback) return yield* Effect.die(new Error(`User ${userId} has no default tag`));
      yield* reassignTagItems(tx, userId, id, fallback.id);
      yield* tx.delete(Tags).where(and(eq(Tags.id, id), eq(Tags.userId, userId)));
      return id;
    }),
  );
});
