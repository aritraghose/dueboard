import { ASK_QUESTION_RETENTION_DAYS } from "./ask-constants.ts";

// The Ask page's pure rules (architecture.md §7.6): whether a question may
// reach the model, and how long the owner keeps it.

/** What the gate knows about the owner and this visitor. */
export interface AskGateInput {
  /** The owner exists and finished onboarding. */
  readonly found: boolean;
  readonly enabled: boolean;
  /** A block either way between the owner and a signed-in visitor. */
  readonly blocked: boolean;
  /** The visitor is the owner, previewing their page (allowed even while it's off; they pay from their own quota). */
  readonly self: boolean;
  /** Signed in (pays from their own quota) or logged out (uses the owner's Ask pool). */
  readonly visitor: "user" | "anon";
  /** Logged-out answers this month, in the owner's zone. */
  readonly poolUsed: number;
  /** The owner's pool size (`monthly_answer_cap`). */
  readonly poolCap: number;
  /** A signed-in visitor's own AI quota has room for one more answer (ignored when logged out). */
  readonly visitorQuotaFits: boolean;
}

/**
 * `ok`, or why not:
 * - `off`: no such page, turned off (except for the owner's preview), or
 *   a block (the page says "not available");
 * - `unavailable`: the owner's Ask pool for logged-out visitors ran out
 *   this month ("unavailable right now", never why);
 * - `quota`: a signed-in visitor used their own AI requests this month.
 */
export type AskGate = "ok" | "off" | "unavailable" | "quota";

export const askGate = (input: AskGateInput): AskGate => {
  if (!input.found || input.blocked || !(input.enabled || input.self)) return "off";
  if (input.visitor === "user") return input.visitorQuotaFits ? "ok" : "quota";
  return input.poolUsed < input.poolCap ? "ok" : "unavailable";
};

/** Questions older than this are hidden and deleted. */
export const askRetentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - ASK_QUESTION_RETENTION_DAYS * 24 * 60 * 60_000);

/** Visitor or owner text, trimmed, with control characters (other than newlines and tabs) removed. */
export const cleanAskText = (text: string): string =>
  text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

/**
 * Text from a converted PDF, ready to keep: the converter's own headings
 * ("# cv.pdf", "## Contents", "### Page 2") and metadata dropped, runs of
 * blank lines squeezed, control characters gone, and cut to `max`
 * characters. `truncated` says whether anything was cut.
 */
export const documentText = (converted: string, max: number): { text: string; truncated: boolean } => {
  const lines = converted.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let inMetadata = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    // The converter's title line is the file name, spaces and all ("# My CV.pdf").
    if (index === 0 && /^#\s+.+\.pdf$/i.test(trimmed)) continue;
    if (/^##\s+Metadata$/i.test(trimmed)) {
      inMetadata = true;
      continue;
    }
    if (/^##\s+Contents$/i.test(trimmed)) {
      inMetadata = false;
      continue;
    }
    if (inMetadata || /^###\s+Page\s+\d+$/i.test(trimmed)) continue;
    kept.push(line.trimEnd());
  }
  const text = cleanAskText(kept.join("\n").replace(/\n{3,}/g, "\n\n"));
  return text.length > max ? { text: text.slice(0, max).trimEnd(), truncated: true } : { text, truncated: false };
};
