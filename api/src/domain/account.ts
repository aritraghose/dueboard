import { eq, or } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import {
  Activity,
  AiUsageEvents,
  AiUsageTotals,
  Blocks,
  ConnectionRequests,
  Connections,
  FocusSessions,
  GoalLinks,
  GoalProgressEvents,
  Goals,
  HabitCheckins,
  Habits,
  Notes,
  Tags,
  Tasks,
  UserSettings,
} from "../schema.ts";
import { Database, transaction, type Executor } from "./database.ts";
import { DeleteAccountInput, InvalidInput, decodeInput } from "./model.ts";
import { queueTiboWipe } from "./tibo.ts";

// Account deletion: every row the user owns, then their Better Auth user.
// The app's rows go in one transaction; Better Auth's (user, sessions,
// accounts) are deleted after it through `AuthAccounts`, which `../api.ts`
// provides. If that second step fails, the user is left signed in with no
// data and can simply try again.

/** Better Auth's side of an account, provided by the ApiWorker. */
export class AuthAccounts extends Context.Service<
  AuthAccounts,
  {
    /** Deletes the user with their sessions and linked accounts. */
    readonly deleteUser: (userId: string) => Effect.Effect<void>;
  }
>()("api/AuthAccounts") {}

/**
 * Every table with rows a user owns, in a safe delete order (tasks before
 * the tags they reference). Child tables that cascade from these
 * (`habit_pauses`, `focus_session_segments`) need no entry. Add each new
 * user-owned table here; `account.test.ts` fails until you do.
 */
export const USER_OWNED_TABLES = [
  { table: GoalLinks, owner: (id: string) => eq(GoalLinks.userId, id) },
  { table: GoalProgressEvents, owner: (id: string) => eq(GoalProgressEvents.userId, id) },
  { table: Goals, owner: (id: string) => eq(Goals.userId, id) },
  { table: HabitCheckins, owner: (id: string) => eq(HabitCheckins.userId, id) },
  { table: Habits, owner: (id: string) => eq(Habits.userId, id) },
  { table: Tasks, owner: (id: string) => eq(Tasks.userId, id) },
  { table: Tags, owner: (id: string) => eq(Tags.userId, id) },
  { table: Notes, owner: (id: string) => eq(Notes.userId, id) },
  { table: FocusSessions, owner: (id: string) => eq(FocusSessions.userId, id) },
  { table: Activity, owner: (id: string) => eq(Activity.userId, id) },
  {
    table: ConnectionRequests,
    owner: (id: string) => or(eq(ConnectionRequests.fromUserId, id), eq(ConnectionRequests.toUserId, id)),
  },
  {
    table: Connections,
    owner: (id: string) => or(eq(Connections.userLow, id), eq(Connections.userHigh, id)),
  },
  { table: Blocks, owner: (id: string) => or(eq(Blocks.blockerId, id), eq(Blocks.blockedId, id)) },
  { table: AiUsageEvents, owner: (id: string) => eq(AiUsageEvents.userId, id) },
  { table: AiUsageTotals, owner: (id: string) => eq(AiUsageTotals.userId, id) },
  { table: UserSettings, owner: (id: string) => eq(UserSettings.userId, id) },
] as const;

/** Deletes every row the user owns, in the caller's transaction. */
export const deleteUserData = (tx: Executor, userId: string) =>
  Effect.forEach(USER_OWNED_TABLES, ({ table, owner }) => tx.delete(table).where(owner(userId)), {
    discard: true,
  });

/**
 * Runs in the deletion's transaction, after the user's rows are gone:
 * queues their `TiboAgent` thread for wiping. The AgentWorker's cron wipes
 * it within a few minutes (`domain/tibo.ts`), so the thread can't outlive
 * the data even if this request dies right after.
 */
export const onAccountDeleted = (tx: Executor, userId: string) => queueTiboWipe(tx, userId);

/**
 * Deletes the account after the user typed their username (`@` and case
 * don't matter). The caller signs them out afterwards.
 */
export const deleteAccount = Effect.fn("deleteAccount")(function* (
  userId: string,
  username: string,
  input: DeleteAccountInput,
) {
  const { confirmUsername } = yield* decodeInput(DeleteAccountInput)(input);
  if (confirmUsername.trim().replace(/^@/, "").toLowerCase() !== username.toLowerCase()) {
    return yield* new InvalidInput({ message: `Type ${username} to confirm.` });
  }
  const db = yield* Database;
  yield* transaction(db, (tx) =>
    deleteUserData(tx, userId).pipe(Effect.andThen(onAccountDeleted(tx, userId))),
  );
  const auth = yield* AuthAccounts;
  yield* auth.deleteUser(userId);
});
