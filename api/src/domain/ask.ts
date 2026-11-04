import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import {
  AskDocuments,
  AskQuestions,
  AskSettingsTable,
  AskUsage,
  Blocks,
  UserSettings,
  type AskSettingsRow,
} from "../schema.ts";
import {
  ASK_ANSWER_MAX_LENGTH,
  ASK_DOCUMENTS_MAX,
  ASK_MONTHLY_ANSWER_CAP_DEFAULT,
  ASK_QUESTIONS_LIST_LIMIT,
  ASK_QUESTION_MAX_LENGTH,
  ASK_UNITS_PER_ANSWER,
} from "./ask-constants.ts";
import { askGate, askRetentionCutoff, cleanAskText, type AskGate } from "./ask-rules.ts";
import { AuthUsers } from "./auth-users.ts";
import { Database, newId, orDieOnDbError, transaction, type Executor } from "./database.ts";
import {
  AddAskDocumentInput,
  AskDocument,
  AskDocumentLimit,
  AskDocumentNotFound,
  AskDocumentRef,
  AskPage,
  AskQuestion,
  AskSettings,
  AskSettingsPatch,
  InvalidInput,
  Person,
  UserNotFound,
  UsernameRef,
  decodeInput,
} from "./model.ts";
import { normalizeUsername } from "./social-rules.ts";
import { canSpend, charge, timeZoneOf } from "./usage.ts";
import { nextResetAt, periodOf } from "./usage-rules.ts";

// The Ask page (architecture.md §7.6): the owner's settings and question log,
// the public page's card, and the two narrow calls the `AskAgent` makes
// through the DomainWorker: `prepareAsk` (may this visitor ask, and what may
// the agent read) and `recordAsk` (charge and log an answer). The agent gets
// nothing else from the domain: no tasks, no Tibo, no other settings.
//
// Who pays: a signed-in visitor pays from their own AI quota; a logged-out
// visitor uses the owner's Ask pool (`monthly_answer_cap`, at most 50 a
// month), which is separate from the owner's own quota.

/** An onboarded user by username, or `null`. */
const findOwner = (db: Executor, input: string) =>
  Effect.gen(function* () {
    const username = normalizeUsername(input);
    if (!username) return null;
    const [row] = yield* db
      .select({ id: AuthUsers.id, name: AuthUsers.name, image: AuthUsers.image, username: AuthUsers.username })
      .from(AuthUsers)
      .where(eq(AuthUsers.username, username))
      .pipe(orDieOnDbError);
    return row ?? null;
  });

/** Who blocked whom between `a` and `b`. */
const blocksBetween = (db: Executor, a: string, b: string) =>
  db
    .select({ blockerId: Blocks.blockerId })
    .from(Blocks)
    .where(
      or(and(eq(Blocks.blockerId, a), eq(Blocks.blockedId, b)), and(eq(Blocks.blockerId, b), eq(Blocks.blockedId, a))),
    )
    .pipe(
      orDieOnDbError,
      Effect.map((rows) => ({
        aBlockedB: rows.some((row) => row.blockerId === a),
        bBlockedA: rows.some((row) => row.blockerId === b),
      })),
    );

const settingsRow = (db: Executor, userId: string) =>
  db
    .select()
    .from(AskSettingsTable)
    .where(eq(AskSettingsTable.userId, userId))
    .pipe(
      orDieOnDbError,
      Effect.map(([row]): AskSettingsRow | null => row ?? null),
    );

/** The owner's answers this month (in their zone), and the month's key. */
const answersThisMonth = (db: Executor, userId: string, now: Date) =>
  Effect.gen(function* () {
    const timeZone = yield* timeZoneOf(db, userId);
    const period = periodOf(now, timeZone);
    const [row] = yield* db
      .select({ answers: AskUsage.answers })
      .from(AskUsage)
      .where(and(eq(AskUsage.userId, userId), eq(AskUsage.period, period)))
      .pipe(orDieOnDbError);
    return { answers: row?.answers ?? 0, period, resetsAt: nextResetAt(now, timeZone) };
  });

/** The owner's files, oldest first. */
const documentsOf = (db: Executor, userId: string) =>
  db
    .select()
    .from(AskDocuments)
    .where(eq(AskDocuments.userId, userId))
    .orderBy(AskDocuments.createdAt, AskDocuments.id)
    .pipe(orDieOnDbError);

// ─── The owner (Settings → Ask page) ─────────────────────────────────────────

export const getAskSettings = Effect.fn("getAskSettings")(function* (userId: string) {
  const db = yield* Database;
  const row = yield* settingsRow(db, userId);
  const usage = yield* answersThisMonth(db, userId, new Date());
  return new AskSettings({
    enabled: row?.enabled ?? false,
    instructions: row?.instructions ?? "",
    sharedContext: row?.sharedContext ?? "",
    monthlyAnswerCap: row?.monthlyAnswerCap ?? ASK_MONTHLY_ANSWER_CAP_DEFAULT,
    poolUsed: usage.answers,
    resetsAt: usage.resetsAt,
    documents: (yield* documentsOf(db, userId)).map(
      (row) => new AskDocument({ id: row.id, name: row.name, text: row.text, createdAt: row.createdAt }),
    ),
  });
});

/** Saves a change (creating the row, off, on first save) and returns the settings. */
export const updateAskSettings = Effect.fn("updateAskSettings")(function* (userId: string, patch: AskSettingsPatch) {
  const decoded = yield* decodeInput(AskSettingsPatch)(patch);
  const values = {
    ...decoded,
    ...(decoded.instructions === undefined ? {} : { instructions: cleanAskText(decoded.instructions) }),
    ...(decoded.sharedContext === undefined ? {} : { sharedContext: cleanAskText(decoded.sharedContext) }),
  };
  if (Object.keys(values).length > 0) {
    const db = yield* Database;
    yield* db
      .insert(AskSettingsTable)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: AskSettingsTable.userId, set: values })
      .pipe(orDieOnDbError);
  }
  return yield* getAskSettings(userId);
});

/**
 * Adds a file's reviewed text (the website converted the PDF; the owner may
 * have edited the text). At most `ASK_DOCUMENTS_MAX`, counted under a lock
 * on the owner so two saves at once can't pass it. Returns the settings.
 */
export const addAskDocument = Effect.fn("addAskDocument")(function* (userId: string, input: AddAskDocumentInput) {
  const { name, text } = yield* decodeInput(AddAskDocumentInput)(input);
  const clean = cleanAskText(text);
  if (clean.length === 0) return yield* new InvalidInput({ message: "That file has no text to keep." });
  const db = yield* Database;
  yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      yield* tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ask-documents:${userId}`}))`);
      const existing = yield* documentsOf(tx, userId);
      if (existing.length >= ASK_DOCUMENTS_MAX) {
        return yield* new AskDocumentLimit({
          message: `Your Ask page can keep ${ASK_DOCUMENTS_MAX} files. Remove one to add another.`,
        });
      }
      yield* tx.insert(AskDocuments).values({ id: newId(), userId, name, text: clean });
    }),
  );
  return yield* getAskSettings(userId);
});

/** Removes one of the owner's files. Returns the settings. */
export const deleteAskDocument = Effect.fn("deleteAskDocument")(function* (userId: string, input: AskDocumentRef) {
  const { id } = yield* decodeInput(AskDocumentRef)(input);
  const db = yield* Database;
  const deleted = yield* db
    .delete(AskDocuments)
    .where(and(eq(AskDocuments.id, id), eq(AskDocuments.userId, userId)))
    .returning({ id: AskDocuments.id })
    .pipe(orDieOnDbError);
  if (deleted.length === 0) return yield* new AskDocumentNotFound({ message: "That file is already gone." });
  return yield* getAskSettings(userId);
});

/** The last `ASK_QUESTION_RETENTION_DAYS` of questions, newest first, with who asked when signed in. */
export const listAskQuestions = Effect.fn("listAskQuestions")(function* (userId: string) {
  const db = yield* Database;
  const rows = yield* db
    .select({
      id: AskQuestions.id,
      question: AskQuestions.question,
      answer: AskQuestions.answer,
      createdAt: AskQuestions.createdAt,
      askerUsername: AuthUsers.username,
      askerName: AuthUsers.name,
      askerImage: AuthUsers.image,
    })
    .from(AskQuestions)
    .leftJoin(AuthUsers, eq(AuthUsers.id, AskQuestions.askerId))
    .where(and(eq(AskQuestions.userId, userId), gte(AskQuestions.createdAt, askRetentionCutoff(new Date()))))
    .orderBy(desc(AskQuestions.createdAt), desc(AskQuestions.id))
    .limit(ASK_QUESTIONS_LIST_LIMIT)
    .pipe(orDieOnDbError);
  return rows.map(
    (row) =>
      new AskQuestion({
        id: row.id,
        question: row.question,
        answer: row.answer,
        createdAt: row.createdAt,
        asker:
          row.askerUsername && row.askerName !== null
            ? new Person({ username: row.askerUsername, name: row.askerName, image: row.askerImage })
            : null,
      }),
  );
});

// ─── The public page (`/@username/ask`) ──────────────────────────────────────

/**
 * The owner's card and whether the viewer can ask. `UserNotFound` for an
 * unknown username or an owner who blocked the viewer (as on the profile).
 */
export const getAskPage = Effect.fn("getAskPage")(function* (viewerId: string | null, input: UsernameRef) {
  const { username } = yield* decodeInput(UsernameRef)(input);
  const db = yield* Database;
  const owner = yield* findOwner(db, username);
  const notFound = new UserNotFound({ message: `There's no one called @${username.replace(/^@/, "")}.`, username });
  if (!owner?.username) return yield* notFound;
  const blocks =
    viewerId !== null && viewerId !== owner.id ? yield* blocksBetween(db, viewerId, owner.id) : null;
  if (blocks?.bBlockedA) return yield* notFound;
  const blocked = blocks?.aBlockedB ?? false;
  const row = yield* settingsRow(db, owner.id);
  const [colorRow] = yield* db
    .select({ color: UserSettings.color })
    .from(UserSettings)
    .where(eq(UserSettings.userId, owner.id))
    .pipe(orDieOnDbError);
  return new AskPage({
    person: new Person({ username: owner.username, name: owner.name, image: owner.image }),
    color: colorRow?.color ?? null,
    // The owner can always preview their own page.
    available: viewerId === owner.id || ((row?.enabled ?? false) && !blocked),
    enabled: row?.enabled ?? false,
    self: viewerId === owner.id,
  });
});

// ─── The Ask agent's two calls (through `../DomainWorker.ts`) ────────────────

/** What the Ask agent may read: the owner's display name, username, instructions, shared context and files' text. Nothing else. */
export interface AskOwnerContext {
  readonly name: string;
  readonly username: string;
  readonly instructions: string;
  readonly sharedContext: string;
  readonly documents: readonly { readonly name: string; readonly text: string }[];
}

export type AskPrepared =
  | { readonly ok: true; readonly owner: AskOwnerContext }
  | { readonly ok: false; readonly gate: Exclude<AskGate, "ok"> };

/**
 * Whether `visitorUserId` (`null` when logged out) may ask `username`'s page
 * one more question now: on, and no block either way; then a signed-in
 * visitor needs room in their own AI quota, a logged-out one needs room in
 * the owner's Ask pool. If so, the only owner data the agent gets. Checked
 * before every model call.
 */
export const prepareAsk = Effect.fn("prepareAsk")(function* (username: string, visitorUserId: string | null) {
  const db = yield* Database;
  const owner = yield* findOwner(db, username);
  if (!owner?.username) return { ok: false, gate: "off" } as AskPrepared;
  const row = yield* settingsRow(db, owner.id);
  const blocks = visitorUserId !== null ? yield* blocksBetween(db, visitorUserId, owner.id) : null;
  const blocked = blocks !== null && (blocks.aBlockedB || blocks.bBlockedA);
  const signedIn = visitorUserId !== null;
  const gate = askGate({
    found: true,
    enabled: row?.enabled ?? false,
    blocked,
    self: visitorUserId === owner.id,
    visitor: signedIn ? "user" : "anon",
    poolUsed: signedIn ? 0 : (yield* answersThisMonth(db, owner.id, new Date())).answers,
    poolCap: row?.monthlyAnswerCap ?? ASK_MONTHLY_ANSWER_CAP_DEFAULT,
    visitorQuotaFits: visitorUserId !== null ? yield* canSpend(visitorUserId, ASK_UNITS_PER_ANSWER) : true,
  });
  if (gate !== "ok" || !row) return { ok: false, gate: gate === "ok" ? "off" : gate } as AskPrepared;
  // Only these fields cross to the agent.
  const documents = yield* documentsOf(db, owner.id);
  return {
    ok: true,
    owner: {
      name: owner.name,
      username: owner.username,
      instructions: row.instructions,
      sharedContext: row.sharedContext,
      documents: documents.map((document) => ({ name: document.name, text: document.text })),
    },
  } as AskPrepared;
});

/**
 * After an answer was shown, in one transaction: a signed-in visitor is
 * charged one AI message from their own quota (`ask_answer`); a logged-out
 * visitor's answer takes one from the owner's Ask pool (`ask_usage`), not
 * the owner's quota. Either way the question is logged for the owner's
 * Settings. Never refuses (`prepareAsk` was the gate), so two questions at
 * once can overshoot by one.
 */
export const recordAsk = Effect.fn("recordAsk")(function* (
  username: string,
  visitorUserId: string | null,
  question: string,
  answer: string,
) {
  const db = yield* Database;
  const owner = yield* findOwner(db, username);
  if (!owner) return;
  const id = newId();
  yield* transaction(db, (tx) =>
    Effect.gen(function* () {
      if (visitorUserId !== null) {
        yield* charge(tx, visitorUserId, ASK_UNITS_PER_ANSWER, "ask_answer", id);
      } else {
        const timeZone = yield* timeZoneOf(tx, owner.id);
        yield* tx
          .insert(AskUsage)
          .values({ userId: owner.id, period: periodOf(new Date(), timeZone), answers: 1 })
          .onConflictDoUpdate({
            target: [AskUsage.userId, AskUsage.period],
            set: { answers: sql`${AskUsage.answers} + 1`, updatedAt: new Date() },
          });
      }
      const cleanQuestion = cleanAskText(question).slice(0, ASK_QUESTION_MAX_LENGTH);
      if (cleanQuestion.length === 0) return;
      yield* tx.insert(AskQuestions).values({
        id,
        userId: owner.id,
        askerId: visitorUserId,
        question: cleanQuestion,
        answer: answer.slice(0, ASK_ANSWER_MAX_LENGTH),
      });
    }),
  );
});

/** Deletes questions past retention (the ApiWorker's cron). Returns how many. */
export const pruneAskQuestions = Effect.fn("pruneAskQuestions")(function* () {
  const db = yield* Database;
  const deleted = yield* db
    .delete(AskQuestions)
    .where(lt(AskQuestions.createdAt, askRetentionCutoff(new Date())))
    .returning({ id: AskQuestions.id })
    .pipe(orDieOnDbError);
  return deleted.length;
});

/** A block hides everything between the two: their questions to each other go, in the block's transaction. */
export const deleteAskQuestionsBetween = (tx: Executor, a: string, b: string) =>
  tx
    .delete(AskQuestions)
    .where(
      or(
        and(eq(AskQuestions.userId, a), eq(AskQuestions.askerId, b)),
        and(eq(AskQuestions.userId, b), eq(AskQuestions.askerId, a)),
      ),
    );
