import { ApiRpcs } from "@dueboard/api/rpc";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as AtomRpc from "effect/reactivity/AtomRpc";
import { RpcClient, RpcSerialization } from "effect/rpc";

/**
 * The browser-side reactive RPC client. Effect 4 ships atom RPC natively in
 * `effect/reactivity/AtomRpc` — `AtomRpc.Service` turns an `RpcGroup`
 * into a `.query()` / `.mutation()` client whose results are atoms.
 *
 * The transport (`protocol`) is a plain HTTP client over `fetch`, pointed at
 * the same-origin `/rpc` route which proxies to the API service binding.
 * Serialization MUST match the ApiWorker (`RpcSerialization.layerJson`).
 *
 * Create query/mutation atoms at module scope, so their identity is stable
 * across renders, e.g. `ApiClient.query("listThings", undefined, {
 * reactivityKeys: ["things"] })` with `ApiClient.mutation("createThing")`. A
 * mutation run with the same reactivity key refetches the query.
 */
export class ApiClient extends AtomRpc.Service<ApiClient>()("ApiClient", {
  group: ApiRpcs,
  protocol: RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(RpcSerialization.layerJson),
  ),
}) {}
