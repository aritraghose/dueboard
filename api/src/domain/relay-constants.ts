// Tibo relays' plain constants (architecture.md §7.5). No imports, so the
// AgentWorker and the browser can use them without pulling in Effect.
// Re-exported by `./model.ts`, which adds their Schemas.

/**
 * A relay's life: `pending` (stored, not yet with the recipient's Tibo),
 * `delivered` (their Tibo has it and told them), then one of `answered`,
 * `declined`, `expired` (no answer in time) or `cancelled` (a block between
 * the two closed it).
 */
export const RELAY_STATUS = ["pending", "delivered", "answered", "declined", "expired", "cancelled"] as const;
export type RelayStatus = (typeof RELAY_STATUS)[number];

/** Statuses a relay can still move on from. */
export const RELAY_OPEN_STATUS = ["pending", "delivered"] as const satisfies readonly RelayStatus[];

/** The longest relayed message, and the longest answer, in characters. */
export const RELAY_MESSAGE_MAX_LENGTH = 1000;
/** How long a relay waits for its answer before it expires. */
export const RELAY_TTL_MS = 7 * 24 * 60 * 60_000;
/** Relays one user may send in any 24 hours (the burst limit is `LIMITS.relay`). */
export const RELAYS_PER_DAY = 30;
/** Open relays from one user to another at once. */
export const RELAY_OPEN_PER_PAIR = 3;
/** Open relays one user may be waiting to answer, from everyone, at once. */
export const RELAY_OPEN_PER_RECIPIENT = 20;

/**
 * Each model turn a relay causes (telling the recipient, then telling the
 * sender the answer) charges this many units to each side: half a message.
 */
export const RELAY_UNITS_PER_SIDE = 1;
