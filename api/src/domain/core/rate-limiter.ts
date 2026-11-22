import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export type UserLimit = "connectionRequest" | "peopleSearch" | "relay";

export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    readonly allow: (limit: UserLimit, userId: string) => Effect.Effect<boolean>;
  }
>()("api/RateLimiter") {}
