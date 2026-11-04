import type { AskPrepared } from "./domain/ask.ts";
import type { AiUsageReason } from "./domain/model.ts";
import type { RelayStatus } from "./domain/relay-constants.ts";
import type { RelayJson, RelaySyncJson } from "./domain/relays.ts";
import type { TiboEventJson, TiboProactiveContext } from "./domain/tibo.ts";

export type { AskOwnerContext, AskPrepared } from "./domain/ask.ts";
export type { RelayJson, RelayPersonJson, RelaySyncJson } from "./domain/relays.ts";
export type { TiboEventJson, TiboProactiveContext, TiboProactiveSettings } from "./domain/tibo.ts";

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

export interface DomainError {
  readonly tag: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type DomainResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: DomainError };

export interface AiUsageJson {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly period: string;
  readonly resetsAt: string;
}

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

export interface AskPort {
  prepare(username: string, visitorUserId: string | null): Promise<AskPrepared>;
  record(username: string, visitorUserId: string | null, question: string, answer: string): Promise<void>;
}

export const askPort = (domain: DomainBinding): AskPort =>
  Object.freeze({
    prepare: (username: string, visitorUserId: string | null) => domain.askPrepare(username, visitorUserId),
    record: async (username: string, visitorUserId: string | null, question: string, answer: string) => {
      await domain.askRecord(username, visitorUserId, question, answer);
    },
  });

export const usageClient = (domain: DomainBinding) => ({
  get: (userId: string) => domain.usageGet(userId),
  check: (userId: string, units: number) => domain.usageCheck(userId, units),
  record: (userId: string, units: number, reason: AiUsageReason, ref: string | null = null) =>
    domain.usageRecord(userId, units, reason, ref),
  chargeSplit: (userA: string, userB: string, unitsEach: number, reason: AiUsageReason, ref: string | null = null) =>
    domain.usageChargeSplit(userA, userB, unitsEach, reason, ref),
});

export const tiboClient = (domain: DomainBinding) => ({
  profile: (userId: string) => domain.tiboProfile(userId),
  proactive: (userId: string) => domain.tiboProactive(userId),
  pendingEvents: () => domain.pendingTiboEvents(),
  eventsDone: (ids: readonly string[]) => domain.tiboEventsDone(ids),
  pendingWipes: () => domain.pendingWipes(),
  wipesDone: (userIds: readonly string[]) => domain.wipesDone(userIds),
});

export type RelayResult<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: DomainError };

const relayCall = async <A>(call: () => Promise<DomainResult>): Promise<RelayResult<A>> => {
  try {
    return (await call()) as RelayResult<A>;
  } catch (error) {
    console.error("Relay call failed", error);
    return { ok: false, error: { tag: "Unavailable", message: "Couldn't reach the app just now." } };
  }
};

export const relayClient = (domain: DomainBinding, actorId: string) => ({
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
