import { and, asc, count, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Tags, Tasks, UserSettings, type TagRow } from "../schema.ts";
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

export const findTag = (tx: Executor, userId: string, id: string) =>
  Effect.gen(function* () {
    const [row] = yield* tx
      .select()
      .from(Tags)
      .where(and(eq(Tags.id, id), eq(Tags.userId, userId)));
    if (!row) return yield* new TagNotFound({ message: "That tag no longer exists.", id });
    return row;
  });

export const findDefaultTag = (tx: Executor, userId: string) =>
  Effect.gen(function* () {
    const [row] = yield* tx
      .select()
      .from(Tags)
      .where(and(eq(Tags.userId, userId), eq(Tags.systemKind, "default")));
    if (!row) return yield* Effect.die(new Error(`User ${userId} has no default tag`));
    return row;
  });

const lockUser = (tx: Executor, userId: string) =>
  tx
    .select({ userId: UserSettings.userId })
    .from(UserSettings)
    .where(eq(UserSettings.userId, userId))
    .for("update");

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

const reassignTagItems = (tx: Executor, userId: string, fromTagId: string, toTagId: string) =>
  tx
    .update(Tasks)
    .set({ tagId: toTagId })
    .where(and(eq(Tasks.userId, userId), eq(Tasks.tagId, fromTagId)));

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
      const fallback = yield* findDefaultTag(tx, userId);
      yield* reassignTagItems(tx, userId, id, fallback.id);
      yield* tx.delete(Tags).where(and(eq(Tags.id, id), eq(Tags.userId, userId)));
      return id;
    }),
  );
});
