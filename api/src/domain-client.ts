import type { AiUsageReason } from "./domain/model.ts";

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
  tiboProfile(userId: string): Promise<{ firstName: string; timeZone: string }>;
  pendingWipes(): Promise<{ userIds: string[] }>;
  wipesDone(userIds: readonly string[]): Promise<{ ok: true }>;
}

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
  pendingWipes: () => domain.pendingWipes(),
  wipesDone: (userIds: readonly string[]) => domain.wipesDone(userIds),
});
