import { describe, expect, test } from "bun:test";
import { askGate, askRetentionCutoff, cleanAskText, documentText, type AskGateInput } from "./ask-rules.ts";

const open: AskGateInput = {
  found: true,
  enabled: true,
  blocked: false,
  self: false,
  visitor: "anon",
  poolUsed: 0,
  poolCap: 50,
  visitorQuotaFits: true,
};

describe("askGate", () => {
  test("lets a question through when everything allows it", () => {
    expect(askGate(open)).toBe("ok");
    expect(askGate({ ...open, visitor: "user" })).toBe("ok");
  });

  test("is off by default, for unknown owners and blocks", () => {
    expect(askGate({ ...open, enabled: false })).toBe("off");
    expect(askGate({ ...open, found: false })).toBe("off");
    expect(askGate({ ...open, visitor: "user", blocked: true })).toBe("off");
  });

  test("the owner can preview their page, even while it's off, on their own quota", () => {
    expect(askGate({ ...open, visitor: "user", self: true, enabled: false })).toBe("ok");
    expect(askGate({ ...open, visitor: "user", self: true, visitorQuotaFits: false })).toBe("quota");
  });

  test("logged-out visitors draw on the owner's pool", () => {
    expect(askGate({ ...open, poolUsed: 49 })).toBe("ok");
    expect(askGate({ ...open, poolUsed: 50 })).toBe("unavailable");
    expect(askGate({ ...open, poolUsed: 3, poolCap: 3 })).toBe("unavailable");
  });

  test("signed-in visitors pay from their own quota, whatever the pool says", () => {
    expect(askGate({ ...open, visitor: "user", poolUsed: 50 })).toBe("ok");
    expect(askGate({ ...open, visitor: "user", visitorQuotaFits: false })).toBe("quota");
  });

  test("an out-of-quota logged-out check is ignored", () => {
    expect(askGate({ ...open, visitorQuotaFits: false })).toBe("ok");
  });

  test("says off before anything else, so a disabled page never hints at usage", () => {
    expect(askGate({ ...open, enabled: false, poolUsed: 99 })).toBe("off");
    expect(askGate({ ...open, enabled: false, visitor: "user", visitorQuotaFits: false })).toBe("off");
  });
});

describe("askRetentionCutoff", () => {
  test("is 30 days back", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    expect(askRetentionCutoff(now).toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
});

describe("cleanAskText", () => {
  test("trims and drops control characters but keeps newlines", () => {
    expect(cleanAskText("  hi\u0000 there\u0007\nnext  ")).toBe("hi there\nnext");
  });
});

describe("documentText", () => {
  test("drops the converter's headings and metadata, keeps the content", () => {
    const converted = [
      "# cv.pdf",
      "## Metadata",
      "- PDFFormatVersion=1.4",
      "- Title=CV",
      "",
      "## Contents",
      "### Page 1",
      "Bea Kim — Product designer",
      "",
      "",
      "",
      "### Page 2",
      "Experience: 6 years",
    ].join("\n");
    expect(documentText(converted, 1000)).toEqual({
      text: "Bea Kim — Product designer\n\nExperience: 6 years",
      truncated: false,
    });
  });

  test("drops the title line for names with spaces too", () => {
    expect(documentText("# Sam test CV.pdf\nSam Rivera - Test CV", 1000).text).toBe("Sam Rivera - Test CV");
  });

  test("cuts long text and says so", () => {
    expect(documentText("a".repeat(50), 20)).toEqual({ text: "a".repeat(20), truncated: true });
  });
});
