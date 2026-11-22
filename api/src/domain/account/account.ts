import { eq, or } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import {
  Activity,
  AiUsageEvents,
  AiUsageTotals,
  AskDocuments,
  AskQuestions,
  AskSettingsTable,
  AskUsage,
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
  Notifications,
  Relays,
  Tags,
  Tasks,
  TiboEvents,
  UserSettings,
} from "../schema.ts";
import { Database, transaction, type Executor } from "./database.ts";
import { DeleteAccountInput, InvalidInput, decodeInput } from "./model.ts";
import { queueTiboWipe } from "./tibo.ts";

export class AuthAccounts extends Context.Service<
  AuthAccounts,
  {
    readonly deleteUser: (userId: string) => Effect.Effect<void>;
  }
>()("api/AuthAccounts") {}

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
    table: Notifications,
    owner: (id: string) => or(eq(Notifications.userId, id), eq(Notifications.actorId, id)),
  },
  {
    table: ConnectionRequests,
    owner: (id: string) => or(eq(ConnectionRequests.fromUserId, id), eq(ConnectionRequests.toUserId, id)),
  },
  {
    table: Connections,
    owner: (id: string) => or(eq(Connections.userLow, id), eq(Connections.userHigh, id)),
  },
  { table: Blocks, owner: (id: string) => or(eq(Blocks.blockerId, id), eq(Blocks.blockedId, id)) },
  { table: Relays, owner: (id: string) => or(eq(Relays.fromUserId, id), eq(Relays.toUserId, id)) },
  { table: AiUsageEvents, owner: (id: string) => eq(AiUsageEvents.userId, id) },
  { table: AskQuestions, owner: (id: string) => or(eq(AskQuestions.userId, id), eq(AskQuestions.askerId, id)) },
  { table: AskUsage, owner: (id: string) => eq(AskUsage.userId, id) },
  { table: AskDocuments, owner: (id: string) => eq(AskDocuments.userId, id) },
  { table: AskSettingsTable, owner: (id: string) => eq(AskSettingsTable.userId, id) },
  { table: AiUsageTotals, owner: (id: string) => eq(AiUsageTotals.userId, id) },
  { table: TiboEvents, owner: (id: string) => eq(TiboEvents.userId, id) },
  { table: UserSettings, owner: (id: string) => eq(UserSettings.userId, id) },
] as const;

export const deleteUserData = (tx: Executor, userId: string) =>
  Effect.forEach(USER_OWNED_TABLES, ({ table, owner }) => tx.delete(table).where(owner(userId)), {
    discard: true,
  });

export const onAccountDeleted = (tx: Executor, userId: string) => queueTiboWipe(tx, userId);

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
