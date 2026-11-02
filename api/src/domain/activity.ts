import { and, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, UserSettings } from "../schema.ts";
import { FALLBACK_TIME_ZONE, localDateOf, type LocalDate } from "./dates.ts";
import { newId, type Executor } from "./database.ts";
import type { ActivityKind, ActivitySubject } from "./model.ts";

// Internal helpers that write the activity feed (architecture.md §5). Domain
// services call them inside the same transaction as the change they record,
// so a rolled-back change never leaves an activity row behind. No RPC
// reaches them directly.

export interface ActivityInput {
  /** The actor. */
  readonly userId: string;
  readonly kind: ActivityKind;
  readonly subjectType: ActivitySubject;
  readonly subjectId: string;
  /** Defaults to now. */
  readonly occurredAt?: Date;
  /** The actor's zone, when the caller already has it; read from settings otherwise. */
  readonly timeZone?: string;
  /**
   * The day the row counts on, when it isn't `occurredAt`'s (a habit
   * completed by a check-in on an earlier day). Skips the zone lookup.
   */
  readonly localDate?: LocalDate;
  /** Kind-specific extras (`goal_progressed` stores the new value). Never titles or privacy. */
  readonly meta?: Record<string, unknown>;
}

/** Inserts one activity row, dated in the actor's time zone. */
export const recordActivity = Effect.fn("recordActivity")(function* (
  tx: Executor,
  input: ActivityInput,
) {
  const occurredAt = input.occurredAt ?? new Date();
  let timeZone = input.timeZone;
  if (!timeZone && !input.localDate) {
    const [settings] = yield* tx
      .select({ timeZone: UserSettings.timeZone })
      .from(UserSettings)
      .where(eq(UserSettings.userId, input.userId));
    // `Bootstrap` creates settings on every app load, so a missing row is
    // unexpected; date the row in UTC rather than lose it.
    if (!settings) yield* Effect.logWarning("recordActivity: no settings row", input.userId);
    timeZone = settings?.timeZone ?? FALLBACK_TIME_ZONE;
  }
  const [row] = yield* tx
    .insert(Activity)
    .values({
      id: newId(),
      userId: input.userId,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurredAt,
      localDate: input.localDate ?? localDateOf(occurredAt, timeZone ?? FALLBACK_TIME_ZONE),
      meta: input.meta ?? {},
    })
    .returning();
  return row!;
});

/**
 * Deletes a subject's activity rows: all of them when the subject is
 * deleted, or one `kind` when a change is reversed (a task un-settled).
 */
export const deleteActivityFor = Effect.fn("deleteActivityFor")(function* (
  tx: Executor,
  subjectType: ActivitySubject,
  subjectId: string,
  kind?: ActivityKind,
) {
  yield* tx
    .delete(Activity)
    .where(
      and(
        eq(Activity.subjectType, subjectType),
        eq(Activity.subjectId, subjectId),
        kind ? eq(Activity.kind, kind) : undefined,
      ),
    );
});
