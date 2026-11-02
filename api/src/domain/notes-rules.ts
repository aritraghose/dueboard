import type { LocalDate } from "./dates.ts";
import { isLocalDate } from "./dates.ts";

// Pure note rules, shared by `notes.ts` and its tests. No I/O.

export interface NoteCursor {
  readonly localDate: LocalDate;
  readonly createdAt: Date;
  readonly id: string;
}

/**
 * `ListNotes` pages newest first by `(local_date, created_at, id)`; the
 * cursor is the last row's triple. The day leads because a note's day is
 * fixed in the user's zone at the time, which a later zone change can put
 * out of step with `created_at`.
 */
export const encodeNoteCursor = ({ localDate, createdAt, id }: NoteCursor): string =>
  `${localDate}|${createdAt.toISOString()}|${id}`;

/** The cursor's triple, or `null` when it's malformed. */
export const decodeNoteCursor = (cursor: string): NoteCursor | null => {
  const [localDate, at, ...rest] = cursor.split("|");
  const id = rest.join("|");
  if (!localDate || !at || !id || !isLocalDate(localDate)) return null;
  const createdAt = new Date(at);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { localDate: localDate as LocalDate, createdAt, id };
};

/**
 * Splits `notes` (already in page order) into runs that share a day,
 * keeping their order.
 */
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

/**
 * Why a note can't be written on `date`, or `null` when it can: notes are
 * only written for today in the user's zone.
 */
export const noteDateError = (date: LocalDate | undefined, today: LocalDate): string | null =>
  date === undefined || date === today ? null : "Notes can only be written for today.";
