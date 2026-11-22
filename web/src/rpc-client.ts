import { ApiRpcs } from "@dueboard/api/rpc";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as AtomRpc from "effect/reactivity/AtomRpc";
import { RpcClient, RpcSerialization } from "effect/rpc";

const browserProtocol = RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerJson),
);

/**
 * Queries run in the browser only. During server rendering the protocol never becomes ready, so every query
 * stays in its loading state and the server's HTML matches the browser's first render.
 */
const serverProtocol: typeof browserProtocol = Layer.effect(RpcClient.Protocol, Effect.never);

export class ApiClient extends AtomRpc.Service<ApiClient>()("ApiClient", {
  group: ApiRpcs,
  protocol: typeof window === "undefined" ? serverProtocol : browserProtocol,
}) {}
