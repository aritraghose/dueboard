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

    yield* ApiWorker;
    const memoryIndex = yield* MemoryIndex;
    for (const { id, propertyName, indexType } of MEMORY_METADATA) {
      yield* Cloudflare.Vectorize.MetadataIndex(id, { indexName: memoryIndex.indexName, propertyName, indexType });
    }
    yield* AgentWorker;
    const gateway = yield* Gateway;

    return {
      branchId: branch.branchId,
      hyperdriveId: hd.hyperdriveId,
      aiGatewayId: gateway.gatewayId,
    };
  }),
);
