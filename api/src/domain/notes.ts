import { and, asc, count, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Notes, UserSettings, type NoteRow } from "../schema.ts";
import { deleteActivityFor, recordActivity } from "./activity.ts";
import { LocalDate, todayIn } from "./dates.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import {
  CreateNoteInput,
  Id,
  InvalidInput,
  ListNotesInput,
  MAX_NOTES_PER_DAY,
  NOTE_PAGE_SIZE_DEFAULT,
  Note,
  NoteDay,
  NoteLimitReached,
  NoteNotFound,
  NotePage,
  NotesForDay,
  UpdateNoteInput,
  decodeInput,
} from "./model.ts";
import { decodeNoteCursor, encodeNoteCursor, groupByDay, noteDateError } from "./notes-rules.ts";
import { titleSearchPattern } from "./tasks-rules.ts";

export const toNote = (row: NoteRow): Note =>
  new Note({
    id: row.id,
    body: row.body,
    localDate: row.localDate,
    privacy: row.privacy,
    shareToLive: row.shareToLive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const notFound = (id: string) => new NoteNotFound({ message: "That note no longer exists.", id });

const findNote = (tx: Executor, userId: string, id: string, lock = false) =>
  Effect.gen(function* () {
    const query = tx
      .select()
      .from(Notes)
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)));
    const [row] = yield* lock ? query.for("update") : query;
    if (!row) return yield* notFound(id);
    return row;
  });

export const createNote = Effect.fn("createNote")(function* (userId: string, input: CreateNoteInput) {
  const values = yield* decodeInput(CreateNoteInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const [settings] = yield* tx
        .select({
          timeZone: UserSettings.timeZone,
          defaultPrivacy: UserSettings.defaultPrivacy,
          defaultShareToLive: UserSettings.defaultShareToLive,
        })
        .from(UserSettings)
        .where(eq(UserSettings.userId, userId))
        .for("update");
      if (!settings) return yield* Effect.die(new Error(`User ${userId} has no settings`));
      const now = new Date();
      const today = todayIn(settings.timeZone, now);
      const dateError = noteDateError(values.date, today);
      if (dateError) return yield* new InvalidInput({ message: dateError });
      const [{ total } = { total: 0 }] = yield* tx
        .select({ total: count() })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), eq(Notes.localDate, today)));
      if (total >= MAX_NOTES_PER_DAY) {
        return yield* new NoteLimitReached({
          message: `You can write up to ${MAX_NOTES_PER_DAY} notes a day.`,
          limit: MAX_NOTES_PER_DAY,
        });
      }
      const [row] = yield* tx
        .insert(Notes)
        .values({
          id: newId(),
          userId,
          body: values.body,
          localDate: today,
          privacy: values.privacy ?? settings.defaultPrivacy,
          shareToLive: values.shareToLive ?? settings.defaultShareToLive,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const note = row!;
      yield* recordActivity(tx, {
        userId,
        kind: "note_created",
        subjectType: "note",
        subjectId: note.id,
        occurredAt: now,
        localDate: today,
      });
      return toNote(note);
    }),
  );
});

export const updateNote = Effect.fn("updateNote")(function* (userId: string, input: UpdateNoteInput) {
  const { id, ...patch } = yield* decodeInput(UpdateNoteInput)(input);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      const current = yield* findNote(tx, userId, id, true);
      if (Object.keys(patch).length === 0) return toNote(current);
      const [row] = yield* tx
        .update(Notes)
        .set(patch)
        .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
        .returning();
      return toNote(row!);
    }),
  );
});

export const deleteNote = Effect.fn("deleteNote")(function* (userId: string, id: string) {
  yield* decodeInput(Id)(id);
  const db = yield* Database;
  return yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* findNote(tx, userId, id, true);
      yield* deleteActivityFor(tx, "note", id);
      yield* tx.delete(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, userId)));
      return id;
    }),
  );
});

export const listNotesForDay = Effect.fn("listNotesForDay")(function* (
  userId: string,
  date: LocalDate,
) {
  const day = yield* decodeInput(LocalDate)(date);
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Notes)
    .where(and(eq(Notes.userId, userId), eq(Notes.localDate, day)))
    .orderBy(asc(Notes.createdAt), asc(Notes.id))
    .pipe(orDieOnDbError);
  return new NotesForDay({ date: day, notes: rows.map(toNote) });
});

export const countNotesForDay = (userId: string, day: LocalDate) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ value: count() })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), eq(Notes.localDate, day)))
      .pipe(orDieOnDbError);
    return row?.value ?? 0;
  });

export const listNotes = Effect.fn("listNotes")(function* (userId: string, input: ListNotesInput) {
  const filters = yield* decodeInput(ListNotesInput)(input);
  const cursor = filters.cursor === undefined ? undefined : decodeNoteCursor(filters.cursor);
  if (cursor === null) {
    return yield* new InvalidInput({ message: "That page link is invalid. Reload the list." });
  }
  const pattern = filters.query === undefined ? null : titleSearchPattern(filters.query);
  const conditions: Array<SQL | undefined> = [
    eq(Notes.userId, userId),
    pattern ? ilike(Notes.body, pattern) : undefined,
    cursor
      ? or(
          lt(Notes.localDate, cursor.localDate),
          and(eq(Notes.localDate, cursor.localDate), lt(Notes.createdAt, cursor.createdAt)),
          and(
            eq(Notes.localDate, cursor.localDate),
            eq(Notes.createdAt, cursor.createdAt),
            lt(Notes.id, cursor.id),
          ),
        )
      : undefined,
  ];
  const limit = filters.limit ?? NOTE_PAGE_SIZE_DEFAULT;
  const db = yield* Database;
  const rows = yield* db
    .select()
    .from(Notes)
    .where(and(...conditions))
    .orderBy(desc(Notes.localDate), desc(Notes.createdAt), desc(Notes.id))
    .limit(limit + 1)
    .pipe(orDieOnDbError);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return new NotePage({
    days: groupByDay(page.map(toNote)).map((day) => new NoteDay(day)),
    nextCursor: rows.length > limit && last ? encodeNoteCursor(last) : null,
  });
});
