/// <reference types="@cloudflare/workers-types" />

import { addDays, dayIn, dayLabel, instantIn, timeIn } from "./dates.ts";

export const MAX_PENDING_REMINDERS = 25;
export const REMINDER_MAX_DAYS = 366;
export const REMINDER_LATE_MS = 6 * 60 * 60_000;
export const REMINDER_MESSAGE_MAX = 300;

export type ReminderStatus = "pending" | "sent" | "cancelled" | "missed";

export interface Reminder {
  readonly id: string;
  readonly at: number;
  readonly about: string;
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

  pending(): Reminder[] {
    return this.sql
      .exec<Row>(`SELECT * FROM reminders WHERE status = 'pending' ORDER BY at`)
      .toArray()
      .map(toReminder);
  }

  countPending(): number {
    return this.sql.exec<{ n: number }>(`SELECT count(*) AS n FROM reminders WHERE status = 'pending'`).one().n;
  }

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
