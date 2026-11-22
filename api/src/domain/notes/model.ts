import * as Schema from "effect/Schema";
import { LocalDate } from "../core/dates.ts";
import { Id, Privacy } from "../core/model.ts";

export const NOTE_BODY_MAX_LENGTH = 60;
export const MAX_NOTES_PER_DAY = 50;
export const NOTE_SEARCH_MAX_LENGTH = 60;
export const NOTE_PAGE_SIZE_DEFAULT = 50;
export const NOTE_PAGE_SIZE_MAX = 100;
export const NOTE_CURSOR_MAX_LENGTH = 160;

export const NoteBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, NOTE_BODY_MAX_LENGTH),
  Schema.makeFilter((value: string) => !/[\r\n]/.test(value) || "A note is a single line"),
);

export const CreateNoteInput = Schema.Struct({
  body: NoteBody,
  date: Schema.optionalKey(LocalDate),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type CreateNoteInput = typeof CreateNoteInput.Type;

export const UpdateNoteInput = Schema.Struct({
  id: Id,
  body: Schema.optionalKey(NoteBody),
  privacy: Schema.optionalKey(Privacy),
  shareToLive: Schema.optionalKey(Schema.Boolean),
});
export type UpdateNoteInput = typeof UpdateNoteInput.Type;

export const ListNotesInput = Schema.Struct({
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_SEARCH_MAX_LENGTH))),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(NOTE_CURSOR_MAX_LENGTH))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: NOTE_PAGE_SIZE_MAX }))),
});
export type ListNotesInput = typeof ListNotesInput.Type;

export class Note extends Schema.Class<Note>("Note")({
  id: Schema.String,
  body: Schema.String,
  localDate: LocalDate,
  privacy: Privacy,
  shareToLive: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class NotesForDay extends Schema.Class<NotesForDay>("NotesForDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

export class NoteDay extends Schema.Class<NoteDay>("NoteDay")({
  date: LocalDate,
  notes: Schema.Array(Note),
}) {}

export class NotePage extends Schema.Class<NotePage>("NotePage")({
  days: Schema.Array(NoteDay),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()("NoteNotFound", {
  message: Schema.String,
  id: Schema.String,
}) {}

export class NoteLimitReached extends Schema.TaggedError<NoteLimitReached>()("NoteLimitReached", {
  message: Schema.String,
  limit: Schema.Number,
}) {}
