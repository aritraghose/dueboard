import { describe, expect, test } from "bun:test";
import { currentActivity, memoryRunDetail, toolLabel } from "./activity-rules.ts";
import type { TiboActivity } from "./protocol.ts";

const activity = (id: string, startedAt: number, extra: Partial<TiboActivity> = {}): TiboActivity => ({
  id,
  kind: "reply",
  label: id,
  status: "running",
  startedAt,
  ...extra,
});

describe("currentActivity", () => {
  test("the newest running step beats its thread", () => {
    expect(
      currentActivity([
        activity("thread", 1),
        activity("tool", 3, { parentId: "thread", kind: "tool" }),
        activity("thinking", 2, { parentId: "thread", kind: "thinking" }),
      ])?.id,
    ).toBe("tool");
  });

  test("a thread with no running step shows itself", () => {
    expect(currentActivity([activity("memory", 5, { kind: "memory" })])?.id).toBe("memory");
  });

  test("nothing running is free", () => {
    expect(currentActivity([activity("old", 1, { status: "done" })])).toBeNull();
    expect(currentActivity([])).toBeNull();
  });
});

describe("labels", () => {
  test("tools read as what Tibo is doing", () => {
    expect(toolLabel("search_conversation")).toBe("Searching our past chats");
    expect(toolLabel("something_new")).toBe("Working on it");
  });

  test("a memory run says what it did, or nothing", () => {
    expect(memoryRunDetail({ memories: 2, files: 1, summaries: 0 })).toBe("Learned 2 memories, noted 1 file");
    expect(memoryRunDetail({ memories: 0, files: 0, summaries: 1 })).toBe("Wrote 1 summary");
    expect(memoryRunDetail({ memories: 0, files: 0, summaries: 0 })).toBeNull();
  });
});
