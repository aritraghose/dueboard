import { describe, expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import {
  LocalDate,
  addDays,
  isLocalDate,
  isValidTimeZone,
  localDateOf,
  startOfWeek,
  todayIn,
} from "./dates.ts";

const d = (value: string) => value as LocalDate;

describe("isLocalDate", () => {
  test("accepts real days", () => {
    expect(isLocalDate("2026-11-01")).toBe(true);
    expect(isLocalDate("2024-02-29")).toBe(true);
  });

  test("rejects other shapes and impossible days", () => {
    expect(isLocalDate("2026-1-01")).toBe(false);
    expect(isLocalDate("2026-11-01T00:00")).toBe(false);
    expect(isLocalDate("2025-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("")).toBe(false);
  });

  test("the schema decodes valid dates and rejects invalid ones", () => {
    expect(Schema.decodeUnknownSync(LocalDate)("2026-11-01")).toBe(d("2026-11-01"));
    expect(() => Schema.decodeUnknownSync(LocalDate)("2026-02-30")).toThrow();
    expect(() => Schema.decodeUnknownSync(LocalDate)(20261101)).toThrow();
  });
});

describe("isValidTimeZone", () => {
  test("accepts IANA zones", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Dhaka")).toBe(true);
  });

  test("rejects unknown zones, offsets and junk", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("+05:00")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("A".repeat(65))).toBe(false);
  });
});

describe("localDateOf", () => {
  // 2026-11-01 03:30 UTC
  const instant = new Date(Date.UTC(2026, 10, 1, 3, 30));

  test("uses the zone's calendar day", () => {
    expect(localDateOf(instant, "UTC")).toBe(d("2026-11-01"));
    expect(localDateOf(instant, "America/Los_Angeles")).toBe(d("2026-10-31"));
    expect(localDateOf(instant, "Asia/Dhaka")).toBe(d("2026-11-01"));
    expect(localDateOf(instant, "Pacific/Kiritimati")).toBe(d("2026-11-01"));
  });

  test("handles the date line", () => {
    const lateUtc = new Date(Date.UTC(2026, 10, 1, 23, 0));
    expect(localDateOf(lateUtc, "Pacific/Kiritimati")).toBe(d("2026-11-02"));
    expect(localDateOf(lateUtc, "Pacific/Pago_Pago")).toBe(d("2026-11-01"));
  });

  test("throws on an invalid zone", () => {
    expect(() => localDateOf(instant, "Nope/Nope")).toThrow();
  });
});

describe("todayIn", () => {
  test("is localDateOf now", () => {
    const now = new Date(Date.UTC(2026, 0, 1, 2, 0));
    expect(todayIn("America/New_York", now)).toBe(d("2025-12-31"));
    expect(todayIn("Europe/London", now)).toBe(d("2026-01-01"));
  });
});

describe("addDays", () => {
  test("moves across months, years and leap days", () => {
    expect(addDays(d("2026-11-01"), 1)).toBe(d("2026-11-02"));
    expect(addDays(d("2026-11-01"), -1)).toBe(d("2026-10-31"));
    expect(addDays(d("2026-12-31"), 1)).toBe(d("2027-01-01"));
    expect(addDays(d("2024-02-28"), 1)).toBe(d("2024-02-29"));
    expect(addDays(d("2026-03-01"), -1)).toBe(d("2026-02-28"));
    expect(addDays(d("2026-11-01"), 0)).toBe(d("2026-11-01"));
  });

  test("ignores DST changes", () => {
    // US DST ends on 2026-11-01; date math is calendar math.
    expect(addDays(d("2026-10-31"), 2)).toBe(d("2026-11-02"));
    expect(addDays(d("2026-03-07"), 1)).toBe(d("2026-03-08"));
  });
});

describe("startOfWeek", () => {
  test("returns the Sunday on or before the date", () => {
    expect(startOfWeek(d("2026-11-01"))).toBe(d("2026-11-01")); // Sunday
    expect(startOfWeek(d("2026-11-07"))).toBe(d("2026-11-01")); // Saturday
    expect(startOfWeek(d("2026-11-04"))).toBe(d("2026-11-01")); // Wednesday
    expect(startOfWeek(d("2027-01-01"))).toBe(d("2026-12-27")); // across a year
  });
});
