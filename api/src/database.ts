import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Neon from "@alchemy.run/neon";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

export const NeonDatabase = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;

  const schema = yield* Drizzle.Schema("Schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
  });

  const project = stage.startsWith("pr-")
    ? yield* Neon.Project.ref("Database", { stage: "staging" })
    : yield* Neon.Project("Database", {
        name: `dueboard-${stage}`,
        region: "aws-us-east-1",
        databaseName: "dueboard",
        historyRetentionSeconds: 21600,
      });

  const branch = yield* Neon.Branch("Branch", {
    project,
    name: stage,
    migrations: schema,
  });

  return { project, branch, schema };
});

export const Hyperdrive = Effect.gen(function* () {
  const { branch } = yield* NeonDatabase;

  return yield* Cloudflare.Hyperdrive.Connection("Hyperdrive", {
    origin: branch.origin,

    dev: branch.pooledOrigin,

    caching: {
      disabled: true,
    },
  });
});
