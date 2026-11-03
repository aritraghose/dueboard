import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Schema from "effect/Schema";
import type { Database } from "./domain/database.ts";
import { AI_UNITS_PER_CHARGE_MAX, AiUsageReason, Id } from "./domain/model.ts";
import * as UsageService from "./domain/usage.ts";
import { INTERNAL_PATH_PREFIX } from "./internal-client.ts";

// The ApiWorker's internal path (`/internal/*`), for the AgentWorker until
// step 18's internal service binding. The browser can't reach it: the
// ApiWorker has no public URL, and the website forwards only `/rpc` and
// `/api/auth/*` to it. The only other caller with the binding is the
// AgentWorker. `./internal-client.ts` is the typed client.

const Units = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: AI_UNITS_PER_CHARGE_MAX }));
const Ref = Schema.NullOr(Schema.String.check(Schema.isMaxLength(128)));

const UsageQuery = Schema.Struct({ userId: Id });
const CheckBody = Schema.Struct({ userId: Id, units: Units });
const RecordBody = Schema.Struct({ userId: Id, units: Units, reason: AiUsageReason, ref: Ref });
const SplitBody = Schema.Struct({
  userA: Id,
  userB: Id,
  unitsEach: Units,
  reason: AiUsageReason,
  ref: Ref,
});

type Route = (
  body: unknown,
) => Effect.Effect<unknown, Schema.SchemaError, UsageService.AiQuota | Database>;

const routes: Record<string, Route> = {
  "usage/get": (body: unknown) =>
    Schema.decodeUnknownEffect(UsageQuery)(body).pipe(
      Effect.flatMap(({ userId }) => UsageService.getUsage(userId)),
    ),
  "usage/check": (body: unknown) =>
    Schema.decodeUnknownEffect(CheckBody)(body).pipe(
      Effect.flatMap(({ userId, units }) =>
        Effect.all({
          allowed: UsageService.canSpend(userId, units),
          usage: UsageService.getUsage(userId),
        }),
      ),
    ),
  "usage/record": (body: unknown) =>
    Schema.decodeUnknownEffect(RecordBody)(body).pipe(
      Effect.flatMap(({ userId, units, reason, ref }) =>
        UsageService.recordUsage(userId, units, reason, ref),
      ),
    ),
  "usage/charge-split": (body: unknown) =>
    Schema.decodeUnknownEffect(SplitBody)(body).pipe(
      Effect.flatMap(({ userA, userB, unitsEach, reason, ref }) =>
        UsageService.chargeSplit(userA, userB, unitsEach, reason, ref),
      ),
      Effect.as({ ok: true }),
    ),
};

/** Serves one `/internal/*` request: a JSON POST, answered with JSON. */
export const serveInternal = (path: string) =>
  Effect.gen(function* () {
    const name = path.slice(INTERNAL_PATH_PREFIX.length);
    const route = Object.hasOwn(routes, name) ? routes[name] : undefined;
    const request = yield* HttpServerRequest;
    if (!route || request.method !== "POST") {
      return HttpServerResponse.text("Not found", { status: 404 });
    }
    const body = yield* request.json.pipe(Effect.orElseSucceed(() => null));
    return yield* route(body).pipe(
      Effect.map((result) => HttpServerResponse.jsonUnsafe(result)),
      Effect.catchTag("SchemaError", (error) =>
        Effect.succeed(HttpServerResponse.jsonUnsafe({ error: error.message }, { status: 400 })),
      ),
    );
  });
