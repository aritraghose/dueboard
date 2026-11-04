import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
import { RuntimeContext } from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Headers from "effect/http/Headers";
import { Rpc, RpcMessage } from "effect/rpc";
import { Hyperdrive } from "./database.ts";
import { AuthAccounts } from "./domain/account.ts";
import { Database } from "./domain/database.ts";
import { DEV_PORTS } from "./dev-ports.ts";
import { AI_UNITS_PER_CHARGE_MAX, AiUsageReason, Id, RelayStatus, type AiUsage } from "./domain/model.ts";
import { RateLimiter } from "./domain/rate-limiter.ts";
import * as AskService from "./domain/ask.ts";
import { ASK_ANSWER_MAX_LENGTH, ASK_QUESTION_MAX_LENGTH } from "./domain/ask-constants.ts";
import * as RelayService from "./domain/relays.ts";
import * as TiboService from "./domain/tibo.ts";
import * as UsageService from "./domain/usage.ts";
import { AiQuota } from "./domain/usage.ts";
import {
  TIBO_RPCS,
  type AiUsageJson,
  type DomainError,
  type DomainResult,
  type TiboRpc,
} from "./domain-client.ts";
import { apiHandlers } from "./handlers.ts";
import { LIMITS, bindingProps } from "./limits.ts";
import { AI_MONTHLY_MESSAGE_QUOTA_DEFAULT, ApiRpcs, CurrentUser, Viewer } from "./rpc.ts";
import { relations } from "./schema.ts";

const TIBO_WIPE_BATCH = 50;
const TIBO_EVENT_BATCH = 200;

const Units = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: AI_UNITS_PER_CHARGE_MAX }));
const Ref = Schema.NullOr(Schema.String.check(Schema.isMaxLength(128)));
const UserIds = Schema.Array(Id).check(Schema.isMaxLength(TIBO_WIPE_BATCH));
const EventIds = Schema.Array(Id).check(Schema.isMaxLength(TIBO_EVENT_BATCH));
const AskUsername = Schema.String.check(Schema.isMaxLength(64));
const AskVisitor = Schema.NullOr(Id);
const AskQuestionText = Schema.String.check(Schema.isMaxLength(ASK_QUESTION_MAX_LENGTH));
const AskAnswerText = Schema.String.check(Schema.isMaxLength(ASK_ANSWER_MAX_LENGTH));

const usageJson = (usage: AiUsage): AiUsageJson => ({
  used: usage.used,
  limit: usage.limit,
  remaining: usage.remaining,
  period: usage.period,
  resetsAt: usage.resetsAt.toISOString(),
});

export default class DomainWorker extends Cloudflare.Worker<DomainWorker>()(
  "DomainWorker",
  {
    main: import.meta.filename,
    workersDev: false,
    dev: { port: DEV_PORTS.DomainWorker },
  },
  Effect.gen(function* () {
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    const monthlyMessages = yield* Config.Int("AI_MONTHLY_MESSAGE_QUOTA").pipe(
      Config.withDefault(AI_MONTHLY_MESSAGE_QUOTA_DEFAULT),
    );
    const relayLimit = yield* Cloudflare.RateLimit(LIMITS.relay.name, bindingProps(LIMITS.relay));
    const services = Layer.mergeAll(
      Layer.succeed(Database, db),
      Layer.succeed(AiQuota, { monthlyMessages }),
      Layer.succeed(RateLimiter, {
        allow: (limit, userId) =>
          limit === "relay"
            ? relayLimit.limit({ key: userId }).pipe(
                Effect.map(({ success }) => success),
                Effect.orDie,
                Effect.provide(RuntimeContext.phantom),
              )
            : Effect.succeed(false),
      }),
      Layer.succeed(AuthAccounts, {
        deleteUser: () => Effect.die(new Error("Tibo can't delete accounts")),
      }),
    );

    const exec = <A, E>(effect: Effect.Effect<A, E, Database | AiQuota | RateLimiter>) =>
      effect.pipe(
        Effect.provide(services),
        Effect.catchDefect((defect) =>
          Effect.logError("Domain call failed", defect).pipe(
            Effect.andThen(Effect.die(new Error("Internal server error"))),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      );

    const result = <A, E>(effect: Effect.Effect<A, E, Database | AiQuota | RateLimiter>) =>
      exec(
        effect.pipe(
          Effect.map((value): DomainResult => ({ ok: true, value: value ?? null })),
          Effect.catch((error) => Effect.succeed<DomainResult>({ ok: false, error: errorOf(plain(error)) })),
        ),
      );
    const actor = (userId: string) => Schema.decodeUnknownEffect(Id)(userId).pipe(Effect.orDie);

    let nextRequestId = 0;

    return {
      run: (actorUserId: string, name: TiboRpc, payload: unknown) =>
        Effect.gen(function* () {
          if (!TIBO_RPCS.includes(name) || !ApiRpcs.requests.has(name)) {
            return {
              ok: false,
              error: { tag: "NotAllowed", message: `${name} isn't available to Tibo.` },
            } satisfies DomainResult;
          }
          const rpc = ApiRpcs.requests.get(name) as Rpc.AnyWithProps;
          const decoded = yield* Schema.decodeUnknownEffect(rpc.payloadSchema as Schema.Codec<unknown, unknown>)(payload).pipe(
            Effect.mapError((error) => ({ tag: "InvalidInput", message: error.message })),
          );
          const handlers = yield* ApiRpcs.toHandlers(apiHandlers).pipe(Effect.provide(services));
          const handler = yield* (ApiRpcs.accessHandler(name).pipe(
            Effect.provide(handlers),
          ) as unknown as Effect.Effect<AnyHandler>);
          const outcome = yield* handler(decoded, {
            client: new Rpc.ServerClient(0),
            requestId: RpcMessage.RequestId(++nextRequestId),
            headers: Headers.empty,
          }).pipe(
            Effect.provideService(CurrentUser, { id: actorUserId, username: "" }),
            Effect.provideService(Viewer, { user: { id: actorUserId, username: "" } }),
            Effect.map((value) => ({ ok: true as const, value })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, error })),
          );
          if (outcome.ok) {
            const value = yield* Schema.encodeUnknownEffect(rpc.successSchema as Schema.Codec<unknown, unknown>)(outcome.value).pipe(
              Effect.orDie,
            );
            return { ok: true, value } satisfies DomainResult;
          }
          const error = yield* Schema.encodeUnknownEffect(rpc.errorSchema as Schema.Codec<unknown, unknown>)(outcome.error).pipe(
            Effect.orDie,
          );
          return { ok: false, error: errorOf(error) } satisfies DomainResult;
        }).pipe(
          Effect.catch((error) => Effect.succeed({ ok: false, error } satisfies DomainResult)),
          exec,
        ),

      usageGet: (userId: string) =>
        exec(
          Schema.decodeUnknownEffect(Id)(userId).pipe(
            Effect.flatMap(UsageService.getUsage),
            Effect.map(usageJson),
            Effect.orDie,
          ),
        ),
      usageCheck: (userId: string, units: number) =>
        exec(
          Effect.all({ userId: Schema.decodeUnknownEffect(Id)(userId), units: Schema.decodeUnknownEffect(Units)(units) }).pipe(
            Effect.flatMap(({ userId, units }) =>
              Effect.all({
                allowed: UsageService.canSpend(userId, units),
                usage: UsageService.getUsage(userId).pipe(Effect.map(usageJson)),
              }),
            ),
            Effect.orDie,
          ),
        ),
      usageRecord: (userId: string, units: number, reason: AiUsageReason, ref: string | null) =>
        exec(
          Effect.all({
            userId: Schema.decodeUnknownEffect(Id)(userId),
            units: Schema.decodeUnknownEffect(Units)(units),
            reason: Schema.decodeUnknownEffect(AiUsageReason)(reason),
            ref: Schema.decodeUnknownEffect(Ref)(ref),
          }).pipe(
            Effect.flatMap(({ userId, units, reason, ref }) => UsageService.recordUsage(userId, units, reason, ref)),
            Effect.map(usageJson),
            Effect.orDie,
          ),
        ),
      usageChargeSplit: (
        userA: string,
        userB: string,
        unitsEach: number,
        reason: AiUsageReason,
        ref: string | null,
      ) =>
        exec(
          Effect.all({
            userA: Schema.decodeUnknownEffect(Id)(userA),
            userB: Schema.decodeUnknownEffect(Id)(userB),
            unitsEach: Schema.decodeUnknownEffect(Units)(unitsEach),
            reason: Schema.decodeUnknownEffect(AiUsageReason)(reason),
            ref: Schema.decodeUnknownEffect(Ref)(ref),
          }).pipe(
            Effect.flatMap(({ userA, userB, unitsEach, reason, ref }) =>
              UsageService.chargeSplit(userA, userB, unitsEach, reason, ref),
            ),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),

      relayCheck: (fromUserId: string, to: string) =>
        result(actor(fromUserId).pipe(Effect.flatMap((id) => RelayService.checkRelay(id, to)))),
      relaySend: (fromUserId: string, toUsername: string, message: string) =>
        result(actor(fromUserId).pipe(Effect.flatMap((id) => RelayService.sendRelay(id, { toUsername, message })))),
      relayGet: (actorId: string, relayId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.getRelay(id, relayId)))),
      relayDelivered: (actorId: string, relayId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.markRelayDelivered(id, relayId)))),
      relayHold: (actorId: string, relayId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.holdRelay(id, relayId)))),
      relayAnswer: (actorId: string, relayId: string, answer: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.answerRelay(id, relayId, answer)))),
      relayDecline: (actorId: string, relayId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.declineRelay(id, relayId)))),
      relayAck: (actorId: string, relayId: string, status: string) =>
        result(
          Effect.all({ id: actor(actorId), status: Schema.decodeUnknownEffect(RelayStatus)(status).pipe(Effect.orDie) }).pipe(
            Effect.flatMap(({ id, status }) => RelayService.ackRelay(id, relayId, status)),
          ),
        ),
      relayList: (actorId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.listRelays(id)))),
      relayExpireNow: (actorId: string, relayId: string) =>
        result(actor(actorId).pipe(Effect.flatMap((id) => RelayService.expireRelayNow(id, relayId)))),
      relaySweep: () => exec(RelayService.sweepRelays().pipe(Effect.map((relays) => ({ relays })))),

      askPrepare: (username: string, visitorUserId: string | null) =>
        exec(
          Effect.all({
            username: Schema.decodeUnknownEffect(AskUsername)(username),
            visitor: Schema.decodeUnknownEffect(AskVisitor)(visitorUserId),
          }).pipe(
            Effect.flatMap(({ username, visitor }) => AskService.prepareAsk(username, visitor)),
            Effect.orDie,
          ),
        ),
      askRecord: (username: string, visitorUserId: string | null, question: string, answer: string) =>
        exec(
          Effect.all({
            username: Schema.decodeUnknownEffect(AskUsername)(username),
            visitor: Schema.decodeUnknownEffect(AskVisitor)(visitorUserId),
            question: Schema.decodeUnknownEffect(AskQuestionText)(question),
            answer: Schema.decodeUnknownEffect(AskAnswerText)(answer),
          }).pipe(
            Effect.flatMap(({ username, visitor, question, answer }) =>
              AskService.recordAsk(username, visitor, question, answer),
            ),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),

      tiboProfile: (userId: string) =>
        exec(Schema.decodeUnknownEffect(Id)(userId).pipe(Effect.flatMap(TiboService.getTiboProfile), Effect.orDie)),
      tiboProactive: (userId: string) =>
        exec(Schema.decodeUnknownEffect(Id)(userId).pipe(Effect.flatMap(TiboService.getTiboProactive), Effect.orDie)),
      pendingTiboEvents: () =>
        exec(TiboService.pendingTiboEvents(TIBO_EVENT_BATCH).pipe(Effect.map((events) => ({ events })))),
      tiboEventsDone: (ids: readonly string[]) =>
        exec(
          Schema.decodeUnknownEffect(EventIds)(ids).pipe(
            Effect.flatMap(TiboService.clearTiboEvents),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),
      pendingWipes: () =>
        exec(TiboService.pendingTiboWipes(TIBO_WIPE_BATCH).pipe(Effect.map((userIds) => ({ userIds })))),
      wipesDone: (userIds: readonly string[]) =>
        exec(
          Schema.decodeUnknownEffect(UserIds)(userIds).pipe(
            Effect.flatMap(TiboService.clearTiboWipes),
            Effect.as({ ok: true as const }),
            Effect.orDie,
          ),
        ),
    };
  }).pipe(
    Effect.provide(Cloudflare.Workers.RateLimitBinding),
    Effect.provide(Cloudflare.Hyperdrive.ConnectBinding),
  ),
) {}

type AnyHandler = (
  payload: unknown,
  options: { client: Rpc.ServerClient; requestId: RpcMessage.RequestId; headers: Headers.Headers },
) => Effect.Effect<unknown, unknown, CurrentUser | Viewer>;

function plain(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return { _tag: "Error", message: String(error) };
  const { _tag, message, ...fields } = error as Record<string, unknown>;
  return { _tag, message, ...(JSON.parse(JSON.stringify(fields)) as Record<string, unknown>) };
}

function errorOf(encoded: unknown): DomainError {
  const { _tag, message, ...details } = (encoded ?? {}) as Record<string, unknown>;
  return {
    tag: typeof _tag === "string" ? _tag : "Error",
    message: typeof message === "string" ? message : "Something went wrong.",
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}
