import * as Schema from "effect/Schema";

export const AI_USAGE_REASON = ["tibo_reply", "tibo_proactive", "relay", "ask_answer", "tibo_image"] as const;
export const AiUsageReason = Schema.Literals(AI_USAGE_REASON);
export type AiUsageReason = typeof AiUsageReason.Type;
export * from "./usage-constants.ts";

export class AiUsage extends Schema.Class<AiUsage>("AiUsage")({
  used: Schema.Number,
  limit: Schema.Number,
  remaining: Schema.Number,
  period: Schema.String,
  resetsAt: Schema.Date,
}) {}
