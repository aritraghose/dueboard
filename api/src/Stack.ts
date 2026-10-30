import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import type ApiWorkerClass from "./api.ts";

/**
 * Typed handle for the Api stack. Other stacks `yield* Api` to read its
 * outputs for the same stage (or `Api.stage.prod` to pin one).
 */
export class Api extends Alchemy.Stack<
  Api,
  {
    branchId: string;
    hyperdriveId: string;
    aiGatewayId: string;
  }
>()("DueboardApi") {}

/**
 * A reference to the deployed `ApiWorker` RpcWorker (`./api.ts`) in the Api
 * stack, for the current stage. The web stack passes it to its Website's `env`
 * so it becomes a private service binding — the Worker itself is only
 * declared (and deployed) by this stack.
 *
 * `Worker.ref` is typed as a plain `Worker`, which drops the RpcWorker's RPC
 * shape, so `Cloudflare.InferEnv` would type `env.API` as the resource
 * instead of a service binding. Typing it as the `ApiWorker` class (what the
 * single-stack example puts in `env`) restores that. The import is type-only,
 * so importers never load `./api.ts`.
 */
export const ApiWorker = Cloudflare.Worker.ref("ApiWorker", {
  stack: "DueboardApi",
}) as unknown as typeof ApiWorkerClass;

/**
 * A reference to the deployed `AgentWorker` (`./AgentWorker.ts`) in the Api
 * stack, for the current stage. The web stack binds it as a private service
 * binding and proxies `/agents/*` to it. `Cloudflare.InferEnv` has no case
 * for a plain Worker, so the web stack types that binding itself.
 */
export const AgentWorker = Cloudflare.Worker.ref("AgentWorker", {
  stack: "DueboardApi",
});
