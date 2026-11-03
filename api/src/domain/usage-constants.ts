// The AI quota's plain constants (architecture.md §8). No imports, so the
// AgentWorker and the browser can use them without pulling in Effect.

/**
 * AI messages a user gets each month in their time zone, when neither
 * `AI_MONTHLY_MESSAGE_QUOTA` (config) nor their `ai_quota_override` says
 * otherwise.
 */
export const AI_MONTHLY_MESSAGE_QUOTA_DEFAULT = 300;
/**
 * The usage ledger counts units: one AI message is 2, so a relay turn can
 * charge half a message (1 unit) to each side.
 */
export const AI_UNITS_PER_MESSAGE = 2;
/** The most units one charge may record (a sanity bound for internal callers). */
export const AI_UNITS_PER_CHARGE_MAX = 20;
