import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Neon from "@alchemy.run/neon";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/**
 * A Drizzle schema + Neon project + feature branch. The branch's
 * `migrations` prop is wired to the schema resource, so the
 * provider order becomes:
 *
 *   1. `Drizzle.Schema` regenerates pending migration SQL files.
 *   2. `Neon.Branch` scans the directory and applies any new migrations
 *      transactionally.
 *
 * Paths are relative to the `api/` workspace, where `alchemy deploy` runs.
 */
export const NeonDatabase = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;

  const schema = yield* Drizzle.Schema("Schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
  });

  // PR preview stages branch off the long-lived `staging` stage's project
  // instead of provisioning their own (see Alchemy's "Branch from a shared
  // database" guide), so `staging` must be deployed before any `pr-*` stage.
  const project = stage.startsWith("pr-")
    ? yield* Neon.Project.ref("Database", { stage: "staging" })
    : yield* Neon.Project("Database", {
        // Each stage gets its own project, so the name includes the stage —
        // a fixed name would collide with the project another stage created.
        name: `dueboard-${stage}`,
        region: "aws-us-east-1",
        // The Postgres database inside the project (Neon's default is `neondb`).
        // Only settable at creation: changing it later replaces the project.
        databaseName: "dueboard",
        // Point-in-time restore window. Alchemy defaults to 24h (86400s), but
        // Neon's free plan allows at most 6h, so cap it there.
        historyRetentionSeconds: 21600,
      });

  const branch = yield* Neon.Branch("Branch", {
    project,
    // Named after the stage instead of a generated name, so the Neon console
    // shows which stage each branch belongs to. Unique within the project:
    // each stage has its own project, and `pr-*` stages share `staging`'s.
    name: stage,
    migrations: schema,
  });

  return { project, branch, schema };
});

/**
 * A Hyperdrive pool in front of the Neon branch. The ApiWorker binds to
 * this so Drizzle talks to Postgres through Cloudflare's connection pooler.
 */
export const Hyperdrive = Effect.gen(function* () {
  const { branch } = yield* NeonDatabase;

  return yield* Cloudflare.Hyperdrive.Connection("Hyperdrive", {
    origin: branch.origin,

    // `alchemy dev` doesn't create a Hyperdrive config: the local Worker
    // connects straight to the database. Point it at Neon's pooled
    // (pgbouncer) endpoint so those local connections are still pooled.
    // Deployed Workers keep using Hyperdrive with the direct `origin`.
    dev: branch.pooledOrigin,

    // By default, Hyperdrive caches responses for 60 seconds.
    // In this case, we wanted database writes to be reflected immediately,
    // so we disabled caching while retaining Hyperdrive for connection pooling.
    // You should configure this based on your requirements.
    // Another common approach is to use two Hyperdrive connections: one with caching enabled
    // for use cases that can accept eventual consistency in exchange for performance, and one
    // without for when you need immediate consistency.
    caching: {
      disabled: true,
    },
  });
});
