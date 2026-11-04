import { and, eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, UserSettings } from "../schema.ts";
import { FALLBACK_TIME_ZONE, localDateOf, type LocalDate } from "./dates.ts";
import { newId, type Executor } from "./database.ts";
import type { ActivityKind, ActivitySubject } from "./model.ts";

export interface ActivityInput {
  readonly userId: string;
  readonly kind: ActivityKind;
  readonly subjectType: ActivitySubject;
  readonly subjectId: string;
  readonly occurredAt?: Date;
  readonly timeZone?: string;
  readonly localDate?: LocalDate;
  readonly meta?: Record<string, unknown>;
}

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
