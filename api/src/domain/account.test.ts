import { describe, expect, test } from "bun:test";
import { getTableName, isTable } from "drizzle-orm";
import * as schema from "../schema.ts";
import { USER_OWNED_TABLES } from "./account.ts";

// Tables that hold no user's rows directly: they cascade from a parent the
// deletion covers.
const CASCADED = new Set(["habit_pauses", "focus_session_segments"]);

describe("account deletion", () => {
  test("covers every table in the schema", () => {
    const covered = new Set<string>(USER_OWNED_TABLES.map(({ table }) => getTableName(table)));
    const tables = Object.values(schema)
      .filter((value) => isTable(value))
      .map((table) => getTableName(table));
    const missing = tables.filter((name) => !covered.has(name) && !CASCADED.has(name));
    expect(missing).toEqual([]);
  });

  test("deletes tasks before the tags they reference", () => {
    const names = USER_OWNED_TABLES.map(({ table }) => getTableName(table));
    expect(names.indexOf("tasks")).toBeLessThan(names.indexOf("tags"));
  });
});
