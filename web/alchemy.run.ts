import * as Cloudflare from "@alchemy.run/cloudflare";
import { AgentWorker, ApiWorker, DEV_PORTS, LIMITS, bindingProps } from "@dueboard/api";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

const STAGE_DOMAINS: Record<string, Cloudflare.WorkerDomainConfig> = {
  production: { name: "dueboard.com", redirects: ["www.dueboard.com"] },
  staging: { name: "staging.dueboard.com" },
};

export class Website extends Cloudflare.Website.Vite<Website>()(
  "Website",
  Effect.map(Alchemy.Stack, ({ stage }) => ({
    compatibility: {
      flags: ["enable_request_signal"],
    },
    dev: { port: DEV_PORTS.Website, strictPort: true },
    domain: STAGE_DOMAINS[stage],
    env: {
      API: ApiWorker,
      AGENT: AgentWorker,
      AUTH_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.auth.name, bindingProps(LIMITS.auth)),
      AGENT_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.agent.name, bindingProps(LIMITS.agent)),
      WEB_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.web.name, bindingProps(LIMITS.web)),
      AI: Cloudflare.Workers.AI(),
      ASK_DOCUMENT_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.askDocument.name, bindingProps(LIMITS.askDocument)),
      TIBO_FILE_RATE_LIMIT: Cloudflare.RateLimit(LIMITS.tiboFile.name, bindingProps(LIMITS.tiboFile)),
    },
  })),
) {}

export type WebsiteEnv = Omit<Cloudflare.InferEnv<typeof Website>, "AGENT"> & {
  AGENT: Fetcher;
};

export default Alchemy.Stack(
  "DueboardWeb",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const website = yield* Website;

    return {
      websiteUrl: website.url.as<string>(),
    };
  }),
);
