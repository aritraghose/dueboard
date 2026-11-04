import type { AskPrepared } from "./domain/ask.ts";
import type { AiUsageReason } from "./domain/model.ts";
import type { RelayStatus } from "./domain/relay-constants.ts";
import type { RelayJson, RelaySyncJson } from "./domain/relays.ts";
import type { TiboEventJson, TiboProactiveContext } from "./domain/tibo.ts";

export type { AskOwnerContext, AskPrepared } from "./domain/ask.ts";
export type { RelayJson, RelayPersonJson, RelaySyncJson } from "./domain/relays.ts";
export type { TiboEventJson, TiboProactiveContext, TiboProactiveSettings } from "./domain/tibo.ts";

// The AgentWorker's side of the DomainWorker (`./DomainWorker.ts`): the RPC
// methods its `env.DOMAIN` binding exposes, and typed clients over them.
// Types only and plain calls, so the AgentWorker's bundle stays free of
// Effect and the database code.

/**
 * The `ApiRpcs` Tibo may run, as its own user. Everything else (settings,
 * social writes, account deletion, other people's data beyond what the
 * visibility rules show) is refused by the DomainWorker.
 */
export const TIBO_RPCS = [
  "ListTags",
  "CreateTag",
  "CreateTask",
  "UpdateTask",
  "SetTaskStatus",
  "DeleteTask",
  "GetTask",
  "ListTasksForDay",
  "ListUnscheduledTasks",
  "ListTasks",
  "CreateHabit",
  "PauseHabit",
  "ResumeHabit",
  "DeleteHabit",
  "CheckInHabit",
  "UndoCheckInHabit",
  "ListHabitsForDay",
  "ListHabits",
  "GetHabit",
  "CreateGoal",
  "UpdateGoal",
  "SetGoalProgress",
  "AdjustGoalProgress",
  "PauseGoal",
  "ResumeGoal",
  "ReopenGoal",
  "DeleteGoal",
  "LinkGoalItem",
  "UnlinkGoalItem",
  "ListGoals",
  "GetGoal",
  "CreateNote",
  "ListNotes",
  "ListNotesForDay",
  "StartSession",
  "PauseSession",
  "ResumeSession",
  "ExtendSession",
  "StopSession",
  "GetActiveSession",
  "ListSessionsForDay",
  "GetDay",
  "GetUpcoming",
  "GetLive",
  "GetDiary",
] as const;
export type TiboRpc = (typeof TIBO_RPCS)[number];

/** A typed domain failure (`TaskNotFound`, `ActiveSessionExists`, …) as plain data. */
export interface DomainError {
  readonly tag: string;
  readonly message: string;
  /** The error's other fields, encoded (an `ActiveSessionExists` carries the running `session`). */
  readonly details?: Record<string, unknown>;
}

/** `run`'s answer: the RPC's success value encoded as JSON, or its typed failure. */
export type DomainResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: DomainError };

/** `AiUsage` as JSON (`resetsAt` is an ISO string). */
export interface AiUsageJson {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly period: string;
  readonly resetsAt: string;
}

/** The DomainWorker's RPC methods, as the AgentWorker's binding sees them. */
export interface DomainBinding {
  run(actorUserId: string, name: TiboRpc, payload: unknown): Promise<DomainResult>;
  usageGet(userId: string): Promise<AiUsageJson>;
  usageCheck(userId: string, units: number): Promise<{ allowed: boolean; usage: AiUsageJson }>;
  usageRecord(userId: string, units: number, reason: AiUsageReason, ref: string | null): Promise<AiUsageJson>;
  usageChargeSplit(
    userA: string,
    userB: string,
    unitsEach: number,
    reason: AiUsageReason,
    ref: string | null,
  ): Promise<{ ok: true }>;
  relayCheck(fromUserId: string, to: string): Promise<DomainResult>;
  relaySend(fromUserId: string, toUsername: string, message: string): Promise<DomainResult>;
  relayGet(actorId: string, relayId: string): Promise<DomainResult>;
  relayDelivered(actorId: string, relayId: string): Promise<DomainResult>;
  relayHold(actorId: string, relayId: string): Promise<DomainResult>;
  relayAnswer(actorId: string, relayId: string, answer: string): Promise<DomainResult>;
  relayDecline(actorId: string, relayId: string): Promise<DomainResult>;
  relayAck(actorId: string, relayId: string, status: RelayStatus): Promise<DomainResult>;
  relayList(actorId: string): Promise<DomainResult>;
  relayExpireNow(actorId: string, relayId: string): Promise<DomainResult>;
  relaySweep(): Promise<{ relays: RelaySyncJson[] }>;
  tiboProfile(userId: string): Promise<{ firstName: string; timeZone: string }>;
  tiboProactive(userId: string): Promise<TiboProactiveContext>;
  pendingTiboEvents(): Promise<{ events: TiboEventJson[] }>;
  tiboEventsDone(ids: readonly string[]): Promise<{ ok: true }>;
  pendingWipes(): Promise<{ userIds: string[] }>;
  wipesDone(userIds: readonly string[]): Promise<{ ok: true }>;
  askPrepare(username: string, visitorUserId: string | null): Promise<AskPrepared>;
  askRecord(username: string, visitorUserId: string | null, question: string, answer: string): Promise<{ ok: true }>;
}

/**
 * The Ask agent's whole view of the domain (architecture.md §7.6): two
 * calls, both about one owner's Ask page. `askPort` closes over the binding
 * so the `AskAgent` never holds `DOMAIN` itself (see `./ask/AskAgent.ts`).
 */
export interface AskPort {
  /** May this visitor ask now, and what may the agent read. */
  prepare(username: string, visitorUserId: string | null): Promise<AskPrepared>;
  /** Charge the owner, count the answer and log the question. */
  record(username: string, visitorUserId: string | null, question: string, answer: string): Promise<void>;
}

export const askPort = (domain: DomainBinding): AskPort =>
  Object.freeze({
    prepare: (username: string, visitorUserId: string | null) => domain.askPrepare(username, visitorUserId),
    record: async (username: string, visitorUserId: string | null, question: string, answer: string) => {
      await domain.askRecord(username, visitorUserId, question, answer);
    },
  });

/**
 * The usage ledger's calls (`domain/usage.ts`). Check with `check` before a
 * model call, then `record` (or `chargeSplit` for a relay turn) after it
 * succeeds.
 */
export const usageClient = (domain: DomainBinding) => ({
  get: (userId: string) => domain.usageGet(userId),
  check: (userId: string, units: number) => domain.usageCheck(userId, units),
  record: (userId: string, units: number, reason: AiUsageReason, ref: string | null = null) =>
    domain.usageRecord(userId, units, reason, ref),
  chargeSplit: (userA: string, userB: string, unitsEach: number, reason: AiUsageReason, ref: string | null = null) =>
    domain.usageChargeSplit(userA, userB, unitsEach, reason, ref),
});

/** What `TiboAgent` reads from Postgres for itself (`domain/tibo.ts`). */
export const tiboClient = (domain: DomainBinding) => ({
  profile: (userId: string) => domain.tiboProfile(userId),
  /** The profile plus the user's check-in settings (`./tibo/proactive.ts`). */
  proactive: (userId: string) => domain.tiboProactive(userId),
  pendingEvents: () => domain.pendingTiboEvents(),
  eventsDone: (ids: readonly string[]) => domain.tiboEventsDone(ids),
  pendingWipes: () => domain.pendingWipes(),
  wipesDone: (userIds: readonly string[]) => domain.wipesDone(userIds),
});

/** A relay call's answer: the relay (or list), or the domain's typed failure. */
export type RelayResult<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: DomainError };

/** A broken call (the DomainWorker unreachable) as a failure, never a throw. */
const relayCall = async <A>(call: () => Promise<DomainResult>): Promise<RelayResult<A>> => {
  try {
    return (await call()) as RelayResult<A>;
  } catch (error) {
    console.error("Relay call failed", error);
    return { ok: false, error: { tag: "Unavailable", message: "Couldn't reach the app just now." } };
  }
};

/**
 * Relays (`domain/relays.ts`), always as `actorId`: the agent passes its own
 * user id, so it can only act as its own side of a relay.
 */
export const relayClient = (domain: DomainBinding, actorId: string) => ({
  /** Who a relay to `to` would reach, or why it can't be sent. Sends nothing. */
  check: (to: string) => relayCall<{ username: string; name: string }>(() => domain.relayCheck(actorId, to)),
  send: (toUsername: string, message: string) =>
    relayCall<RelayJson>(() => domain.relaySend(actorId, toUsername, message)),
  get: (relayId: string) => relayCall<RelayJson>(() => domain.relayGet(actorId, relayId)),
  delivered: (relayId: string) => relayCall<RelayJson>(() => domain.relayDelivered(actorId, relayId)),
  hold: (relayId: string) => relayCall<null>(() => domain.relayHold(actorId, relayId)),
  answer: (relayId: string, answer: string) =>
    relayCall<RelayJson>(() => domain.relayAnswer(actorId, relayId, answer)),
  decline: (relayId: string) => relayCall<RelayJson>(() => domain.relayDecline(actorId, relayId)),
  ack: (relayId: string, status: RelayStatus) => relayCall<null>(() => domain.relayAck(actorId, relayId, status)),
  list: () => relayCall<RelayJson[]>(() => domain.relayList(actorId)),
  expireNow: (relayId: string) => relayCall<null>(() => domain.relayExpireNow(actorId, relayId)),
});
