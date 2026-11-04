/// <reference types="@cloudflare/workers-types" />

// Reminders the user asks Tibo for in chat ("let me know tomorrow at 8 PM
// to watch the match", step 20): the one kind of message Tibo may arrange
// from a conversation. Settings stay out of its reach.
//
// Tibo writes the reminder's words when it's set (that turn was charged),
// and the alarm delivers them as a Tibo bubble: no model call, no charge,
// so a reminder can't be skipped for quota. The user asked for it, so the
// check-in rules (switches, the daily cap, quiet) don't apply; only one
// delayed by an outage past `REMINDER_LATE_MS` is dropped, as missed.

import { addDays, dayIn, dayLabel, instantIn, timeIn } from "./dates.ts";

/** Pending reminders a user may have at once. */
export const MAX_PENDING_REMINDERS = 25;
/** How far ahead a reminder may be set. */
export const REMINDER_MAX_DAYS = 366;
/** A reminder this late (the agent was down) is marked missed, not sent. */
export const REMINDER_LATE_MS = 6 * 60 * 60_000;
/** The longest reminder text. */
export const REMINDER_MESSAGE_MAX = 300;

export type ReminderStatus = "pending" | "sent" | "cancelled" | "missed";

export interface Reminder {
  readonly id: string;
  /** ms */
  readonly at: number;
  /** What it's about, short ("Real Madrid vs Barça"). */
  readonly about: string;
  /** The bubble Tibo sends then. */
  readonly message: string;
  readonly status: ReminderStatus;
  readonly createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  about TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_status_at_idx ON reminders (status, at);
`;

type Row = {
  id: string;
  at: number;
  about: string;
  message: string;
  status: ReminderStatus;
  created_at: number;
  updated_at: number;
};

const toReminder = (row: Row): Reminder => ({
  id: row.id,
  at: row.at,
  about: row.about,
  message: row.message,
  status: row.status,
  createdAt: row.created_at,
});

/**
 * When a reminder for `date` at `time` (the user's local `HH:MM`) would
 * fire, or why it can't be set. Pure.
 */
export const reminderInstant = (
  input: { date: string; time: string },
  timeZone: string,
  now: number,
  today: string,
): { at: number } | { error: string } => {
  if (!/^\d{2}:\d{2}$/.test(input.time)) return { error: "The time must be HH:MM, 24-hour." };
  const [hours = 0, minutes = 0] = input.time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return { error: "That isn't a time of day." };
  if (input.date > addDays(today, REMINDER_MAX_DAYS)) return { error: "Reminders can be at most a year ahead." };
  const at = instantIn(timeZone, input.date, input.time);
  if (Number.isNaN(at)) return { error: "That isn't a date." };
  if (at < now + 30_000) return { error: "That time has already passed. Ask which day they meant." };
  return { at };
};

/** "Tomorrow, 8:00 PM" in the user's zone. */
export const reminderWhen = (at: number, timeZone: string, today: string) =>
  `${dayLabel(dayIn(timeZone, new Date(at)), today)}, ${timeIn(new Date(at), timeZone)}`;

export class ReminderStore {
  constructor(private readonly sql: SqlStorage) {}

  migrate() {
    this.sql.exec(SCHEMA);
  }

  add(input: { at: number; about: string; message: string; now: number }): Reminder {
    const row = this.sql
      .exec<Row>(
        `INSERT INTO reminders (id, at, about, message, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?) RETURNING *`,
        crypto.randomUUID(),
        input.at,
        input.about,
        input.message,
        input.now,
        input.now,
      )
      .one();
    return toReminder(row);
  }

  get(id: string): Reminder | null {
    const row = this.sql.exec<Row>(`SELECT * FROM reminders WHERE id = ?`, id).toArray()[0];
    return row ? toReminder(row) : null;
  }

  /** Pending ones, soonest first. */
  pending(): Reminder[] {
    return this.sql
      .exec<Row>(`SELECT * FROM reminders WHERE status = 'pending' ORDER BY at`)
      .toArray()
      .map(toReminder);
  }

  countPending(): number {
    return this.sql.exec<{ n: number }>(`SELECT count(*) AS n FROM reminders WHERE status = 'pending'`).one().n;
  }

  /** Moves a pending reminder on; `null` if it wasn't pending (so it's sent at most once). */
  settle(id: string, status: Exclude<ReminderStatus, "pending">): Reminder | null {
    const row = this.sql
      .exec<Row>(
        `UPDATE reminders SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending' RETURNING *`,
        status,
        Date.now(),
        id,
      )
      .toArray()[0];
    return row ? toReminder(row) : null;
  }
}
