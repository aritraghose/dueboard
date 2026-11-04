import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Activity, Blocks, FocusSessions, Goals, Habits, Notes, Tasks } from "../schema.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, orDieOnDbError } from "./database.ts";
import {
  GetProfileItemsInput,
  InvalidInput,
  PROFILE_ITEMS_PAGE_SIZE,
  ProfileItem,
  ProfileItemPage,
  UserNotFound,
  decodeInput,
} from "./model.ts";
import { FEED_KINDS, decodeItemCursor, encodeItemCursor } from "./profile-rules.ts";
import { normalizeUsername } from "./social-rules.ts";
import {
  activitySubjectExists,
  activitySubjectJoin,
  activitySubjectPrivacy,
  activitySubjectTitle,
  privacyVisibleSql,
  viewerRelation,
} from "./visibility.ts";

const notFound = (username: string) =>
  new UserNotFound({ message: `There's no one called @${username.replace(/^@/, "")}.`, username });

export const profileOwner = Effect.fn("profileOwner")(function* (viewerId: string | null, typed: string) {
  const username = normalizeUsername(typed);
  if (!username) return yield* notFound(typed);
  const db = yield* Database;
  const [owner] = yield* db
    .select({ id: AuthUsers.id })
    .from(AuthUsers)
    .where(eq(AuthUsers.username, username))
    .pipe(orDieOnDbError);
  if (!owner) return yield* notFound(typed);
  const relation = yield* viewerRelation(viewerId, owner.id);
  if (relation === "blocked" && viewerId !== null && (yield* blockedBy(owner.id, viewerId))) {
    return yield* notFound(typed);
  }
  return { id: owner.id, relation, hidden: relation === "blocked" };
});

export const getProfileItems = Effect.fn("getProfileItems")(function* (
  viewerId: string | null,
  input: GetProfileItemsInput,
) {
  const { username: typed, feed, cursor } = yield* decodeInput(GetProfileItemsInput)(input);
  const after = cursor === undefined ? undefined : decodeItemCursor(cursor);
  if (after === null) return yield* new InvalidInput({ message: "That page link is no longer valid." });
  const owner = yield* profileOwner(viewerId, typed);
  if (owner.hidden) return new ProfileItemPage({ items: [], nextCursor: null });
  const { relation } = owner;
  const db = yield* Database;

  const rows = yield* db
    .select({
      id: Activity.id,
      kind: Activity.kind,
      localDate: Activity.localDate,
      occurredAt: Activity.occurredAt,
      title: activitySubjectTitle,
      privacy: activitySubjectPrivacy,
      plannedMinutes: FocusSessions.plannedMinutes,
    })
    .from(Activity)
    .leftJoin(Tasks, activitySubjectJoin.task)
    .leftJoin(Habits, activitySubjectJoin.habit)
    .leftJoin(Goals, activitySubjectJoin.goal)
    .leftJoin(FocusSessions, activitySubjectJoin.session)
    .leftJoin(Notes, activitySubjectJoin.note)
    .where(
      and(
        eq(Activity.userId, owner.id),
        inArray(Activity.kind, [...FEED_KINDS[feed]]),
        activitySubjectExists,
        privacyVisibleSql(relation, activitySubjectPrivacy),
        after
          ? or(
              lt(Activity.occurredAt, after.occurredAt),
              and(eq(Activity.occurredAt, after.occurredAt), lt(Activity.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(Activity.occurredAt), desc(Activity.id))
    .limit(PROFILE_ITEMS_PAGE_SIZE + 1)
    .pipe(orDieOnDbError);

  const page = rows.slice(0, PROFILE_ITEMS_PAGE_SIZE);
  const last = page.at(-1);
  return new ProfileItemPage({
    items: page.map(
      (row) =>
        new ProfileItem({
          id: row.id,
          kind: row.kind,
          title: row.title,
          localDate: row.localDate as ProfileItem["localDate"],
          occurredAt: row.occurredAt,
          privacy: row.privacy!,
          plannedMinutes: row.plannedMinutes,
        }),
    ),
    nextCursor: rows.length > PROFILE_ITEMS_PAGE_SIZE && last ? encodeItemCursor(last.occurredAt, last.id) : null,
  });
});

const blockedBy = (blockerId: string, blockedId: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const [row] = yield* db
      .select({ blockerId: Blocks.blockerId })
      .from(Blocks)
      .where(and(eq(Blocks.blockerId, blockerId), eq(Blocks.blockedId, blockedId)))
      .pipe(orDieOnDbError);
    return row !== undefined;
  });
