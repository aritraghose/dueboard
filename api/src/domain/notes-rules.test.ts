import { describe, expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import type { LocalDate } from "./dates.ts";
import { CreateNoteInput, NOTE_BODY_MAX_LENGTH } from "./model.ts";
import { decodeNoteCursor, encodeNoteCursor, groupByDay, noteDateError } from "./notes-rules.ts";

const d = (value: string) => value as LocalDate;

describe("note cursor", () => {
  test("round-trips", () => {
    const cursor = {
      localDate: d("2026-11-03"),
      createdAt: new Date("2026-11-03T10:20:30.456Z"),
      id: "3f1c2b8e-0000-4000-8000-000000000000",
    };
    expect(decodeNoteCursor(encodeNoteCursor(cursor))).toEqual(cursor);
  });

  test("rejects malformed cursors", () => {
    expect(decodeNoteCursor("")).toBeNull();
    expect(decodeNoteCursor("2026-11-03|2026-11-03T10:20:30.456Z")).toBeNull();
    expect(decodeNoteCursor("2026-11-03||abc")).toBeNull();
    expect(decodeNoteCursor("2026-02-30|2026-11-03T10:20:30.456Z|abc")).toBeNull();
    expect(decodeNoteCursor("2026-11-03|not a date|abc")).toBeNull();
  });
});

describe("groupByDay", () => {
  test("keeps order and splits on day changes", () => {
    const notes = [
      { id: "a", localDate: d("2026-11-03") },
      { id: "b", localDate: d("2026-11-03") },
      { id: "c", localDate: d("2026-11-01") },
    ];
    expect(groupByDay(notes)).toEqual([
      { date: d("2026-11-03"), notes: [notes[0]!, notes[1]!] },
      { date: d("2026-11-01"), notes: [notes[2]!] },
    ]);
    expect(groupByDay([])).toEqual([]);
  });
});

describe("noteDateError", () => {
  test("allows today or no date only", () => {
    expect(noteDateError(undefined, d("2026-11-03"))).toBeNull();
    expect(noteDateError(d("2026-11-03"), d("2026-11-03"))).toBeNull();
    expect(noteDateError(d("2026-11-02"), d("2026-11-03"))).not.toBeNull();
    expect(noteDateError(d("2026-11-04"), d("2026-11-03"))).not.toBeNull();
  });
});

describe("note body", () => {
  const valid = (body: string) => Schema.is(CreateNoteInput)({ body });

  test("takes 1–60 characters", () => {
    expect(valid("x".repeat(NOTE_BODY_MAX_LENGTH))).toBe(true);
    expect(valid("x".repeat(NOTE_BODY_MAX_LENGTH + 1))).toBe(false);
    expect(valid("")).toBe(false);
  });

  test("must be trimmed and one line", () => {
    expect(valid(" shipped it")).toBe(false);
    expect(valid("shipped\nit")).toBe(false);
  });
});
