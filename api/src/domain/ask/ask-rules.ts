import { ASK_QUESTION_RETENTION_DAYS } from "./ask-constants.ts";

export interface AskGateInput {
  readonly found: boolean;
  readonly enabled: boolean;
  readonly blocked: boolean;
  readonly self: boolean;
  readonly visitor: "user" | "anon";
  readonly poolUsed: number;
  readonly poolCap: number;
  readonly visitorQuotaFits: boolean;
}

export type AskGate = "ok" | "off" | "unavailable" | "quota";

export const askGate = (input: AskGateInput): AskGate => {
  if (!input.found || input.blocked || !(input.enabled || input.self)) return "off";
  if (input.visitor === "user") return input.visitorQuotaFits ? "ok" : "quota";
  return input.poolUsed < input.poolCap ? "ok" : "unavailable";
};

export const askRetentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - ASK_QUESTION_RETENTION_DAYS * 24 * 60 * 60_000);

export const cleanAskText = (text: string): string =>
  text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

export const documentText = (converted: string, max: number): { text: string; truncated: boolean } => {
  const lines = converted.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let inMetadata = false;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
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
