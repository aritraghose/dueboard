export type LimitKey = "ip" | "user" | "visitor";

export interface RateLimitSpec {
  readonly name: string;
  readonly namespaceId: number;
  readonly simple: { readonly limit: number; readonly period: 10 | 60 };
  readonly key: LimitKey;
  readonly where: string;
}

const limit = <const S extends RateLimitSpec>(spec: S): S => spec;

export const LIMITS = {
  auth: limit({
    name: "AUTH_RATE_LIMIT",
    namespaceId: 1003,
    simple: { limit: 30, period: 60 },
    key: "ip",
    where: "Website: `/api/auth/*` (`web/src/routes/api/auth/$.ts`)",
  }),
  rpc: limit({
    name: "RPC_RATE_LIMIT",
    namespaceId: 1004,
    simple: { limit: 120, period: 60 },
    key: "user",
    where: "ApiWorker: `Authentication` middleware, and `PublicRpcs` for signed-in viewers",
  }),
  chat: limit({
    name: "CHAT_RATE_LIMIT",
    namespaceId: 1005,
    simple: { limit: 10, period: 60 },
    key: "user",
    where: "AgentWorker: `TiboAgent.turn` (`tibo/TiboAgent.ts`)",
  }),
  connectionRequest: limit({
    name: "CONNECTION_REQUEST_RATE_LIMIT",
    namespaceId: 1006,
    simple: { limit: 5, period: 60 },
    key: "user",
    where: "ApiWorker: `domain/social.ts` through `RateLimiter`",
  }),
  relay: limit({
    name: "RELAY_RATE_LIMIT",
    namespaceId: 1007,
    simple: { limit: 5, period: 60 },
    key: "user",
    where: "DomainWorker: `domain/relays.ts` through `RateLimiter`",
  }),
  publicRead: limit({
    name: "PUBLIC_READ_RATE_LIMIT",
    namespaceId: 1008,
    simple: { limit: 60, period: 60 },
    key: "ip",
    where: "ApiWorker: `OptionalAuthentication` middleware, logged-out viewers",
  }),
  ask: limit({
    name: "ASK_RATE_LIMIT",
    namespaceId: 1009,
    simple: { limit: 3, period: 60 },
    key: "visitor",
    where: "AgentWorker: `AskAgent` (`ask/AskAgent.ts`), before each model call",
  }),
  askDocument: limit({
    name: "ASK_DOCUMENT_RATE_LIMIT",
    namespaceId: 1013,
    simple: { limit: 5, period: 60 },
    key: "user",
    where: "Website: `/api/ask-documents/convert` (`web/src/server.ts`)",
  }),
  tiboFile: limit({
    name: "TIBO_FILE_RATE_LIMIT",
    namespaceId: 1014,
    simple: { limit: 10, period: 60 },
    key: "user",
    where: "Website: `POST /agents/tibo-agent/*/files` (`web/src/server.ts`)",
  }),
  agent: limit({
    name: "AGENT_RATE_LIMIT",
    namespaceId: 1010,
    simple: { limit: 60, period: 60 },
    key: "ip",
    where: "Website: `/agents/*` proxy (`web/src/server.ts`)",
  }),
  peopleSearch: limit({
    name: "PEOPLE_SEARCH_RATE_LIMIT",
    namespaceId: 1011,
    simple: { limit: 30, period: 60 },
    key: "user",
    where: "ApiWorker: `domain/social.ts` through `RateLimiter`",
  }),
  web: limit({
    name: "WEB_RATE_LIMIT",
    namespaceId: 1012,
    simple: { limit: 300, period: 60 },
    key: "ip",
    where: "Website: `web/src/server.ts`",
  }),
} as const;

export const RESERVED_NAMESPACE_IDS = {} as const;

export const bindingProps = ({ namespaceId, simple }: RateLimitSpec) => ({
  namespaceId,
  simple: { limit: simple.limit, period: simple.period },
});

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export const MAX_CHAT_MESSAGE_LENGTH = 4000;
