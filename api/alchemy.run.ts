import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle";
import * as Neon from "@alchemy.run/neon";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import AgentWorker, { Gateway, MEMORY_METADATA, MemoryIndex } from "./src/AgentWorker.ts";
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
    // Tibo's memory index and the metadata it filters on, before any vector
    // is written (only vectors written after a metadata index are filterable).
    const memoryIndex = yield* MemoryIndex;
    for (const { id, propertyName, indexType } of MEMORY_METADATA) {
      yield* Cloudflare.Vectorize.MetadataIndex(id, { indexName: memoryIndex.indexName, propertyName, indexType });
    }
    // Same for the chat agent, bound by the web stack's `/agents/*` proxy.
    yield* AgentWorker;
    const gateway = yield* Gateway;

    return {
      branchId: branch.branchId,
      hyperdriveId: hd.hyperdriveId,
      // Add the Meta key (BYOK) to this gateway in the dashboard.
      aiGatewayId: gateway.gatewayId,
    };
  }),
);
