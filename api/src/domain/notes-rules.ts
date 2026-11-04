import type { LocalDate } from "./dates.ts";
import { isLocalDate } from "./dates.ts";

export interface NoteCursor {
  readonly localDate: LocalDate;
  readonly createdAt: Date;
  readonly id: string;
}

export const encodeNoteCursor = ({ localDate, createdAt, id }: NoteCursor): string =>
  `${localDate}|${createdAt.toISOString()}|${id}`;

export const decodeNoteCursor = (cursor: string): NoteCursor | null => {
  const [localDate, at, ...rest] = cursor.split("|");
  const id = rest.join("|");
  if (!localDate || !at || !id || !isLocalDate(localDate)) return null;
  const createdAt = new Date(at);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { localDate: localDate as LocalDate, createdAt, id };
};

export const groupByDay = <T extends { readonly localDate: LocalDate }>(
  notes: ReadonlyArray<T>,
): Array<{ date: LocalDate; notes: Array<T> }> => {
  const days: Array<{ date: LocalDate; notes: Array<T> }> = [];
  for (const note of notes) {
    const last = days.at(-1);
    if (last && last.date === note.localDate) last.notes.push(note);
    else days.push({ date: note.localDate, notes: [note] });
  }
  return days;
};

export const noteDateError = (date: LocalDate | undefined, today: LocalDate): string | null =>
  date === undefined || date === today ? null : "Notes can only be written for today.";
