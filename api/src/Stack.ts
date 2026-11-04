import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import type ApiWorkerClass from "./api.ts";

export class Api extends Alchemy.Stack<
  Api,
  {
    branchId: string;
    hyperdriveId: string;
    aiGatewayId: string;
  }
>()("DueboardApi") {}

export const ApiWorker = Cloudflare.Worker.ref("ApiWorker", {
  stack: "DueboardApi",
}) as unknown as typeof ApiWorkerClass;

export const AgentWorker = Cloudflare.Worker.ref("AgentWorker", {
  stack: "DueboardApi",
});
