import { describe, expect, test } from "bun:test";
import { BULK_LIMIT, TurnLedger, receiptFor } from "./actions.ts";

describe("TurnLedger", () => {
  test("changes past the bulk limit must wait, held ones included", () => {
    const ledger = new TurnLedger();
    for (let i = 0; i < BULK_LIMIT - 1; i += 1) ledger.record({ text: `Created task: ${i}` }, ["tasks"]);
    expect(ledger.overBulkLimit).toBe(false);
    ledger.held.push({
      rpc: "DeleteTask",
      payload: { id: "x" },
      summary: "Delete task: x",
      done: "Deleted task: x",
      keys: ["tasks"],
      verb: "Deleted",
    });
    expect(ledger.overBulkLimit).toBe(true);
  });

  test("records receipts and the lists to refresh", () => {
    const ledger = new TurnLedger();
    ledger.record({ text: "Checked in: Read" }, ["habits"]);
    ledger.record({ text: "Started a 25 min session" }, ["sessions", "active-session"]);
    expect(ledger.receipts).toEqual([{ text: "Checked in: Read" }, { text: "Started a 25 min session" }]);
    expect([...ledger.changed]).toEqual(["habits", "sessions", "active-session"]);
    expect(ledger.mutations).toBe(2);
  });
});

describe("receiptFor", () => {
  const call = {
    rpc: "CreateTask" as const,
    payload: {},
    summary: "Create task: Call mom",
    done: "Created task: Call mom · Tomorrow",
    keys: ["tasks"],
    verb: "Created",
    item: { kind: "task" as const, title: "Call mom" },
  };

  test("a create takes its item's id from the answer", () => {
    expect(receiptFor(call, { id: "t1", title: "Call mom" })).toEqual({
      text: "Created task: Call mom · Tomorrow",
      verb: "Created",
      item: { kind: "task", id: "t1", title: "Call mom" },
    });
  });

  test("a known id wins, and no id means no item", () => {
    expect(receiptFor({ ...call, item: { kind: "task", id: "t9" } }, { id: "other" }).item).toEqual({
      kind: "task",
      id: "t9",
    });
    expect(receiptFor(call, "deleted-id-as-string").item).toBeUndefined();
  });
});
