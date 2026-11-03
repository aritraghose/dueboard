import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

// The Cloudflare Rate Limiting checks a domain service makes itself, so
// every caller (the RPC handlers now, Tibo's tools later) is held to the
// same limits. `../api.ts` provides it from the bindings declared in
// `../limits.ts`.

/** A limit a service checks, keyed by user. */
export type UserLimit = "connectionRequest" | "peopleSearch";

export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    /** `true` when `userId` may go ahead. */
    readonly allow: (limit: UserLimit, userId: string) => Effect.Effect<boolean>;
  }
>()("api/RateLimiter") {}
