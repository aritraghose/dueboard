import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Postgres";
// import * as Neon from "@alchemy.run/neon"; // Neon.Connect alternative
import { RuntimeContext } from "alchemy";
import type { HttpEffect } from "alchemy/Http";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import { RpcSerialization, RpcServer } from "effect/rpc";
import { Auth } from "./auth.ts";
import { Hyperdrive } from "./database.ts";
import * as AccountService from "./domain/account.ts";
import { AuthAccounts } from "./domain/account.ts";
import { Database } from "./domain/database.ts";
import * as DaysService from "./domain/days.ts";
import * as GoalsService from "./domain/goals.ts";
import * as HabitsService from "./domain/habits.ts";
import * as NotesService from "./domain/notes.ts";
import * as PointsService from "./domain/points.ts";
import * as ProfileItemsService from "./domain/profile-items.ts";
import * as SessionsService from "./domain/sessions.ts";
import { RateLimiter } from "./domain/rate-limiter.ts";
import * as SettingsService from "./domain/settings.ts";
import * as SocialService from "./domain/social.ts";
import * as TagsService from "./domain/tags.ts";
import * as TasksService from "./domain/tasks.ts";
// import { NeonDatabase } from "./database.ts"; // Neon.Connect alternative
import {
  CONNECTION_REQUEST_LIMIT,
  PEOPLE_SEARCH_LIMIT,
  PUBLIC_READ_LIMIT,
  RPC_LIMIT,
} from "./limits.ts";
import {
  ApiRpcs,
  Authentication,
  BootstrapResult,
  CurrentUser,
  OptionalAuthentication,
  TooManyRequests,
  Unauthorized,
  Viewer,
} from "./rpc.ts";
import { relations } from "./schema.ts";

/**
 * The RPC API. A {@link Cloudflare.Workers.RpcWorker} that serves {@link ApiRpcs}
 * over HTTP (JSON), backed by Drizzle talking to Neon Postgres through a
 * Hyperdrive pool. A direct-to-Neon version (`Neon.Connect`, no Hyperdrive)
 * is kept commented out below. It is bound to the web stack's Website as a private service
 * binding — the browser never reaches it directly; the TanStack `/rpc` route
 * proxies to it (see `web/src/routes/rpc.ts`). It also hosts Better Auth
 * (`./auth.ts`) under `/api/auth/*`, proxied by `web/src/routes/api/auth/$.ts`,
 * and every RPC runs as the signed-in user.
 *
 * The web stack binds this Worker by its Logical ID (`"ApiWorker"`) through
 * the `ApiWorker` reference in `./Stack.ts` — keep the two in sync.
 */
export default class ApiWorker extends Cloudflare.Workers.RpcWorker<ApiWorker>()(
  "ApiWorker",
  {
    main: import.meta.filename,
    workersDev: false, // no workers.dev URL; we use the service binding instead
    schema: ApiRpcs,
  },
  Effect.gen(function* () {
    // Hyperdrive: Cloudflare's connection pool in front of Neon, so each
    // request reuses warm connections instead of opening a new one.
    const conn = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
    const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    // Neon.Connect alternative (no Hyperdrive): hands the Worker the branch's
    // pooled connection string as a secret. Every request then opens a new
    // Postgres connection, which is slow when the database is far away. To use
    // it, replace the two lines above with these three, swap the
    // `Effect.provide(...)` at the end of this Worker, and uncomment the
    // `Neon` and `NeonDatabase` imports.
    // const { branch } = yield* NeonDatabase;
    // const conn = yield* Neon.Connect(branch);
    // const db = yield* Drizzle.Postgres(conn.connectionString, { relations });

    // Rate Limiting bindings, configured in `./limits.ts` (architecture.md
    // §9). The per-user RPC budget keeps one account from flooding the
    // database; the others guard social writes, search and public reads.
    const rpcLimit = yield* Cloudflare.RateLimit("RPC_RATE_LIMIT", RPC_LIMIT);
    const connectionRequestLimit = yield* Cloudflare.RateLimit(
      "CONNECTION_REQUEST_RATE_LIMIT",
      CONNECTION_REQUEST_LIMIT,
    );
    const peopleSearchLimit = yield* Cloudflare.RateLimit("PEOPLE_SEARCH_RATE_LIMIT", PEOPLE_SEARCH_LIMIT);
    const publicReadLimit = yield* Cloudflare.RateLimit("PUBLIC_READ_RATE_LIMIT", PUBLIC_READ_LIMIT);

    // The focus-session sweep (architecture.md §11): every minute, complete
    // the running sessions whose time ran out, even with the app closed.
    // Reads also complete them lazily, so a late or missed run only delays
    // the `session_completed` activity. Failures are logged, never thrown:
    // the next minute's run retries, and a run is safe to repeat.
    yield* Cloudflare.Workers.cron("* * * * *", () =>
      SessionsService.sweepExpiredSessions().pipe(
        Effect.tap((completed) =>
          completed > 0 ? Effect.log(`Session sweep completed ${completed}`) : Effect.void,
        ),
        Effect.provideService(Database, db),
        Effect.catchCause((cause) => Effect.logError("Session sweep failed", cause)),
      ),
    );

    // Resolves the session for each RPC from the cookies the web
    // stack's `/rpc` proxy forwards, and runs the handler as that user.
    const auth = yield* Auth;
    // RPCs skip Better Auth's cookie cache and read the session from the
    // database, so a revoked session loses data access at once. Route
    // guards still use the cache.
    const sessionFrom = (headers: unknown) =>
      auth.api
        .getSession({
          headers: new Headers(headers as Record<string, string>),
          query: { disableCookieCache: true },
        })
        .pipe(Effect.orDie);
    const tooManyRequests = new TooManyRequests({
      message: "Too many requests. Please wait a minute and try again.",
    });
    // Defects (database or session lookup failures) would reach the browser
    // with their message and cause, which can include SQL and connection
    // details. Log them here and send a generic defect. RPC handlers don't
    // carry Alchemy's runtime marker; the Worker owns the request scope
    // (same as the HttpApi middleware in Alchemy's Better Auth example).
    const guarded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.catchDefect((defect) =>
          Effect.logError("RPC failed", defect).pipe(
            Effect.andThen(Effect.die(new Error("Internal server error"))),
          ),
        ),
        Effect.provide(RuntimeContext.phantom),
      );
    const authentication = Layer.succeed(
      Authentication,
      (effect, { headers }) =>
        Effect.gen(function* () {
          const session = yield* sessionFrom(headers);
          if (!session) {
            return yield* new Unauthorized({ message: "Sign in to continue." });
          }
          if (!session.user.username) {
            return yield* new Unauthorized({ message: "Choose a username to continue." });
          }
          const { success } = yield* rpcLimit
            .limit({ key: session.user.id })
            .pipe(Effect.orDie);
          if (!success) return yield* tooManyRequests;
          return yield* Effect.provideService(effect, CurrentUser, {
            id: session.user.id,
            username: session.user.username,
          });
        }).pipe(guarded),
    );

    // `PublicRpcs`: the session if there is one, never required. Signed-in
    // viewers share the per-user RPC budget; logged-out visitors are
    // limited by IP (Cloudflare sets `cf-connecting-ip`, and the website's
    // `/rpc` proxy forwards the request's headers unchanged).
    const optionalAuthentication = Layer.succeed(
      OptionalAuthentication,
      (effect, { headers }) =>
        Effect.gen(function* () {
          const session = yield* sessionFrom(headers);
          const user = session?.user.username
            ? { id: session.user.id, username: session.user.username }
            : null;
          const ip = (headers as Record<string, string | undefined>)["cf-connecting-ip"] ?? "unknown";
          const { success } = yield* (user
            ? rpcLimit.limit({ key: user.id })
            : publicReadLimit.limit({ key: ip })
          ).pipe(Effect.orDie);
          if (!success) return yield* tooManyRequests;
          return yield* Effect.provideService(effect, Viewer, { user });
        }).pipe(guarded),
    );

    // The limits domain services check themselves, so Tibo's tools (step
    // 18) are held to them too.
    const rateLimiter = Layer.succeed(RateLimiter, {
      allow: (limit, userId) =>
        (limit === "connectionRequest" ? connectionRequestLimit : peopleSearchLimit)
          .limit({ key: userId })
          .pipe(
            Effect.map(({ success }) => success),
            Effect.orDie,
            Effect.provide(RuntimeContext.phantom),
          ),
    });

    // Better Auth's side of account deletion: its internal adapter removes
    // the user with their sessions and linked accounts. Signing out after
    // that clears the cookies (and the cached session copy).
    const authAccounts = Layer.succeed(AuthAccounts, {
      deleteUser: (userId) =>
        Effect.gen(function* () {
          const instance = yield* auth.auth;
          const context = yield* Effect.promise(() => instance.$context);
          yield* Effect.promise(() => context.internalAdapter.deleteUser(userId));
        }).pipe(Effect.provide(RuntimeContext.phantom)),
    });

    // One handler per RPC in `ApiRpcs`, each running as `CurrentUser` (the
    // `PublicRpcs` ones as `Viewer`).
    // Handlers stay thin: the rules live in the domain services
    // (`./domain/`), which take the acting user id explicitly, query through
    // `Database`, and turn database errors into defects, so each handler's
    // error channel matches its RPC schema.
    const handlers = ApiRpcs.toLayer({
      Bootstrap: ({ timeZone }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return new BootstrapResult(yield* SettingsService.bootstrap(user.id, timeZone));
        }),
      UpdateSettings: (patch) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SettingsService.updateSettings(user.id, patch);
        }),
      ListTags: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.listTags(user.id);
        }),
      CreateTag: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.createTag(user.id, input);
        }),
      UpdateTag: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.updateTag(user.id, input);
        }),
      DeleteTag: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TagsService.deleteTag(user.id, id);
        }),
      CreateTask: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.createTask(user.id, input);
        }),
      UpdateTask: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.updateTask(user.id, input);
        }),
      SetTaskStatus: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.setTaskStatus(user.id, input);
        }),
      DeleteTask: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.deleteTask(user.id, id);
        }),
      GetTask: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.getTask(user.id, id);
        }),
      ListTasksForDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.listTasksForDay(user.id, date);
        }),
      ListUnscheduledTasks: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.listUnscheduledTasks(user.id, input);
        }),
      ListTasks: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* TasksService.listTasks(user.id, input);
        }),
      CreateHabit: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.createHabit(user.id, input);
        }),
      UpdateHabit: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.updateHabit(user.id, input);
        }),
      PauseHabit: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.pauseHabit(user.id, id);
        }),
      ResumeHabit: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.resumeHabit(user.id, id);
        }),
      ArchiveHabit: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.archiveHabit(user.id, id);
        }),
      DeleteHabit: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.deleteHabit(user.id, id);
        }),
      CheckInHabit: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.checkIn(user.id, input);
        }),
      UndoCheckInHabit: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.undoCheckIn(user.id, input);
        }),
      ListHabitsForDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.listHabitsForDay(user.id, date);
        }),
      ListHabits: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.listHabits(user.id);
        }),
      GetHabit: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* HabitsService.getHabit(user.id, id);
        }),
      CreateGoal: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.createGoal(user.id, input);
        }),
      UpdateGoal: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.updateGoal(user.id, input);
        }),
      SetGoalProgress: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.setProgress(user.id, input);
        }),
      AdjustGoalProgress: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.adjustProgress(user.id, input);
        }),
      PauseGoal: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.pauseGoal(user.id, id);
        }),
      ResumeGoal: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.resumeGoal(user.id, id);
        }),
      ReopenGoal: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.reopenGoal(user.id, id);
        }),
      DeleteGoal: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.deleteGoal(user.id, id);
        }),
      LinkGoalItem: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.linkItem(user.id, input);
        }),
      UnlinkGoalItem: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.unlinkItem(user.id, input);
        }),
      ListGoalsForDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.listGoalsForDay(user.id, date);
        }),
      ListGoals: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.listGoals(user.id, input);
        }),
      GetGoal: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.getGoal(user.id, id);
        }),
      ListItemGoals: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* GoalsService.listItemGoals(user.id, input);
        }),
      CreateNote: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* NotesService.createNote(user.id, input);
        }),
      UpdateNote: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* NotesService.updateNote(user.id, input);
        }),
      DeleteNote: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* NotesService.deleteNote(user.id, id);
        }),
      ListNotesForDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* NotesService.listNotesForDay(user.id, date);
        }),
      ListNotes: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* NotesService.listNotes(user.id, input);
        }),
      StartSession: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.startSession(user.id, input);
        }),
      PauseSession: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.pauseSession(user.id, id);
        }),
      ResumeSession: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.resumeSession(user.id, id);
        }),
      ExtendSession: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.extendSession(user.id, input);
        }),
      StopSession: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.stopSession(user.id, id);
        }),
      GetActiveSession: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.getActiveSession(user.id);
        }),
      ListSessions: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.listSessions(user.id, input);
        }),
      ListSessionsForDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.listSessionsForDay(user.id, date);
        }),
      GetDay: ({ date }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* DaysService.getDay(user.id, date);
        }),
      GetUpcoming: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* DaysService.getUpcoming(user.id, input);
        }),
      DeleteSession: ({ id }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SessionsService.deleteSession(user.id, id);
        }),
      SendConnectionRequest: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.sendConnectionRequest(user.id, input);
        }),
      AcceptConnectionRequest: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.acceptConnectionRequest(user.id, input);
        }),
      DeclineConnectionRequest: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.declineConnectionRequest(user.id, input);
        }),
      CancelConnectionRequest: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.cancelConnectionRequest(user.id, input);
        }),
      RemoveConnection: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.removeConnection(user.id, input);
        }),
      BlockUser: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.blockUser(user.id, input);
        }),
      UnblockUser: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.unblockUser(user.id, input);
        }),
      GetSocialOverview: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.getSocialOverview(user.id);
        }),
      SearchPeople: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* SocialService.searchPeople(user.id, input);
        }),
      DeleteAccount: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* AccountService.deleteAccount(user.id, user.username, input);
        }),
      GetProfile: (input) =>
        Effect.gen(function* () {
          const { user } = yield* Viewer;
          return yield* SocialService.getProfile(user?.id ?? null, input);
        }),
      GetProfileItems: (input) =>
        Effect.gen(function* () {
          const { user } = yield* Viewer;
          return yield* ProfileItemsService.getProfileItems(user?.id ?? null, input);
        }),
      GetLeaderboard: (input) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          return yield* PointsService.getLeaderboard(user.id, input);
        }),
    }).pipe(Layer.provide(Layer.mergeAll(Layer.succeed(Database, db), rateLimiter, authAccounts)));

    // One Worker serves two things: Better Auth's routes (proxied by the web
    // stack's `/api/auth/*` route) and the RPCs (proxied by `/rpc`).
    // The RPC server forks into its own scope, while Better Auth needs the
    // runtime context of the request; the annotation names both so the
    // RpcWorker accepts the result.
    type Requirements = RuntimeContext | Scope.Scope;
    const serve: Effect.Effect<HttpEffect<Requirements>, never, Requirements> = Effect.gen(
      function* () {
        const rpc = yield* RpcServer.toHttpEffect(ApiRpcs);
        return Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          const path = new URL(request.url, "http://localhost").pathname;
          if (path === "/api/auth" || path.startsWith("/api/auth/")) {
            return yield* auth.fetch;
          }
          return yield* rpc;
        });
      },
    ).pipe(
      Effect.provide(
        Layer.mergeAll(handlers, authentication, optionalAuthentication, RpcSerialization.layerJson),
      ),
    );
    return serve;
  }).pipe(
    Effect.provide(Auth.layer),
    Effect.provide(Cloudflare.Workers.CronEventSourceLive),
    Effect.provide(Cloudflare.Workers.RateLimitBinding),
    Effect.provide(Cloudflare.Hyperdrive.ConnectBinding),
  ),
  // Neon.Connect alternative: use `Neon.ConnectHttp` instead of
  // `Cloudflare.Hyperdrive.ConnectBinding` above (Auth keeps Hyperdrive).
) {}
