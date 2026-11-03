// Every Cloudflare Rate Limiting binding in the app, in one registry
// (architecture.md §9). Both stacks read it: the ApiWorker and AgentWorker
// here in `api/`, and the website through `@dueboard/api`
// (`web/alchemy.run.ts`). Counting is approximate and per Cloudflare
// location: abuse protection, not exact quotas. Each `namespaceId` must be
// unique within the Cloudflare account, and the binding only counts per 10
// or 60 seconds, so daily caps are counted in Postgres by the services.

/** What a limit counts by. */
export type LimitKey = "ip" | "user" | "visitor";

export interface RateLimitSpec {
  /** The binding's name in its Worker's `env`. */
  readonly name: string;
  readonly namespaceId: number;
  readonly simple: { readonly limit: number; readonly period: 10 | 60 };
  readonly key: LimitKey;
  /** The Worker that binds it and where it's checked. */
  readonly where: string;
}

const limit = <const S extends RateLimitSpec>(spec: S): S => spec;

export const LIMITS = {
  /** Better Auth's routes, per IP. */
  auth: limit({
    name: "AUTH_RATE_LIMIT",
    namespaceId: 1003,
    simple: { limit: 30, period: 60 },
    key: "ip",
    where: "Website: `/api/auth/*` (`web/src/routes/api/auth/$.ts`)",
  }),
  /** Every authenticated RPC, per user. */
  rpc: limit({
    name: "RPC_RATE_LIMIT",
    namespaceId: 1004,
    simple: { limit: 120, period: 60 },
    key: "user",
    where: "ApiWorker: `Authentication` middleware, and `PublicRpcs` for signed-in viewers",
  }),
  /** Chat turns, per user. Each is a paid model call, sent over the WebSocket. */
  chat: limit({
    name: "CHAT_RATE_LIMIT",
    namespaceId: 1005,
    simple: { limit: 10, period: 60 },
    key: "user",
    where: "AgentWorker: `ChatAgent.onChatMessage`",
  }),
  /**
   * Sending connection requests, per user: a burst limit. The 20-a-day cap
   * (`CONNECTION_REQUESTS_PER_DAY`) is counted from `connection_requests`.
   */
  connectionRequest: limit({
    name: "CONNECTION_REQUEST_RATE_LIMIT",
    namespaceId: 1006,
    simple: { limit: 5, period: 60 },
    key: "user",
    where: "ApiWorker: `domain/social.ts` through `RateLimiter`",
  }),
  /** Public reads (`PublicRpcs`) by logged-out visitors, per IP. */
  publicRead: limit({
    name: "PUBLIC_READ_RATE_LIMIT",
    namespaceId: 1008,
    simple: { limit: 60, period: 60 },
    key: "ip",
    where: "ApiWorker: `OptionalAuthentication` middleware, logged-out viewers",
  }),
  /** `/agents/*` WebSocket upgrades and HTTP, per IP, before the session lookup. */
  agent: limit({
    name: "AGENT_RATE_LIMIT",
    namespaceId: 1010,
    simple: { limit: 60, period: 60 },
    key: "ip",
    where: "Website: `/agents/*` proxy (`web/src/server.ts`)",
  }),
  /** People search, per user. Searches are debounced as the user types. */
  peopleSearch: limit({
    name: "PEOPLE_SEARCH_RATE_LIMIT",
    namespaceId: 1011,
    simple: { limit: 30, period: 60 },
    key: "user",
    where: "ApiWorker: `domain/social.ts` through `RateLimiter`",
  }),
  /**
   * Everything else the website's Worker serves, per IP, before any session
   * lookup: `/rpc` (signed out or not), page loads and server functions
   * (`getSessionUser`). `/api/auth/*` and `/agents/*` have their own.
   */
  web: limit({
    name: "WEB_RATE_LIMIT",
    namespaceId: 1012,
    simple: { limit: 300, period: 60 },
    key: "ip",
    where: "Website: `web/src/server.ts`",
  }),
} as const;

/** Ids taken by limits a later step adds, so nothing else claims them. */
export const RESERVED_NAMESPACE_IDS = {
  1007: "Relays sent, per user (step 21)",
  1009: "Ask page questions, per visitor, plus Turnstile (step 22)",
} as const;

/** The props `Cloudflare.RateLimit(name, props)` takes. */
export const bindingProps = ({ namespaceId, simple }: RateLimitSpec) => ({
  namespaceId,
  simple: { limit: simple.limit, period: simple.period },
});

/**
 * The largest request body the website accepts (`web/src/server.ts`). The
 * biggest RPC input (a task with a 2000-character description and its
 * fields) is a few KiB.
 */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** The longest chat message the agent takes, in characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
