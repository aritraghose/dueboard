import { describe, expect, test } from "bun:test";
import { canSeeItem, visiblePrivacies } from "./visibility-rules.ts";

describe("visibility", () => {
  test("the owner sees everything", () => {
    expect(visiblePrivacies("self")).toEqual(["public", "connections", "private"]);
  });

  test("connections see public and connections-only items", () => {
    expect(canSeeItem("connected", "connections")).toBe(true);
    expect(canSeeItem("connected", "private")).toBe(false);
  });

  test("anyone else (logged out too) sees public items only", () => {
    expect(visiblePrivacies("other")).toEqual(["public"]);
  });

  test("a block hides everything", () => {
    expect(visiblePrivacies("blocked")).toEqual([]);
    expect(canSeeItem("blocked", "public")).toBe(false);
  });
});
