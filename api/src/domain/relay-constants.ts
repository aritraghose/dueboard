export const RELAY_STATUS = ["pending", "delivered", "answered", "declined", "expired", "cancelled"] as const;
export type RelayStatus = (typeof RELAY_STATUS)[number];

export const RELAY_OPEN_STATUS = ["pending", "delivered"] as const satisfies readonly RelayStatus[];

export const RELAY_MESSAGE_MAX_LENGTH = 1000;
export const RELAY_TTL_MS = 7 * 24 * 60 * 60_000;
export const RELAYS_PER_DAY = 30;
export const RELAY_OPEN_PER_PAIR = 3;
export const RELAY_OPEN_PER_RECIPIENT = 20;

export const RELAY_UNITS_PER_SIDE = 1;
