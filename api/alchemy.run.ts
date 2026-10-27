import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Neon from "@alchemy.run/neon";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import ApiWorker from "./src/api.ts";
import { Hyperdrive, NeonDatabase } from "./src/database.ts";
import { Api } from "./src/Stack.ts";

export default Api.make(
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers(), Neon.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { branch } = yield* NeonDatabase;
    const hd = yield* Hyperdrive;

    // No Website in this stack binds the ApiWorker, so yield it explicitly to
    // deploy it. The web stack binds it by reference (`ApiWorker` in `./src/Stack.ts`).
    yield* ApiWorker;

    return {
      branchId: branch.branchId,
      hyperdriveId: hd.hyperdriveId,
    };
  }),
);
