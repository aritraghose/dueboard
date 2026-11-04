import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { askEnv } from "../ask-env.ts";
import type { AgentEnv } from "../AgentWorker.ts";

// The Ask agent is walled off from everything else about the owner in code
// (architecture.md §7.6): its modules import nothing of Tibo's and never name
// the bindings that reach the owner's data, and the env it's built with
// holds only the narrow `ASK` port.

const here = import.meta.dirname;
const sources = readdirSync(here)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => ({ file, text: readFileSync(join(here, file), "utf8") }))
  // Code only: the doc comments explain what the agent doesn't get.
  .map(({ file, text }) => ({ file, text: text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") }));

describe("Ask agent walls", () => {
  test("imports nothing from Tibo, the domain services or the Worker's global env", () => {
    for (const { file, text } of sources) {
      const imports = [...text.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
      for (const path of imports) {
        expect({ file, path, tibo: path.includes("/tibo/") || path.includes("tibo") }).toEqual({ file, path, tibo: false });
        expect({ file, path, global: path === "cloudflare:workers" }).toEqual({ file, path, global: false });
        // Only the domain's plain constants (no services, no database).
        if (path.startsWith("../domain/")) expect({ file, path }).toEqual({ file, path: "../domain/ask-constants.ts" });
      }
    }
  });

  test("never names the bindings to the owner's data", () => {
    for (const { file, text } of sources) {
      for (const name of ["DOMAIN", "TiboAgent", "MEMORY", "getAgentByName", "env.API"]) {
        expect({ file, name, found: text.includes(name) }).toEqual({ file, name, found: false });
      }
    }
  });

  test("its env holds only the model, its limit, Turnstile and the narrow port", () => {
    const calls: string[] = [];
    const domain = new Proxy(
      {},
      {
        get: (_, method: string) => async () => {
          calls.push(method);
          return { ok: false, gate: "off" };
        },
      },
    );
    const env = askEnv({
      AI: {},
      AI_GATEWAY_ID: "gw",
      DOMAIN: domain,
      TiboAgent: {},
      MEMORY: {},
      ASK_RATE_LIMIT: {},
      TURNSTILE_SITE_KEY: "site",
      TURNSTILE_SECRET: "secret",
      TURNSTILE_HOSTNAMES: "a.example, b.example",
    } as unknown as AgentEnv);
    expect(Object.keys(env).sort()).toEqual(
      ["AI", "AI_GATEWAY_ID", "ASK", "ASK_RATE_LIMIT", "TURNSTILE_HOSTNAMES", "TURNSTILE_SECRET", "TURNSTILE_SITE_KEY"].sort(),
    );
    expect(Object.keys(env.ASK).sort()).toEqual(["prepare", "record"]);
    expect(env.TURNSTILE_HOSTNAMES).toEqual(["a.example", "b.example"]);
    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.ASK)).toBe(true);
    void env.ASK.prepare("bea", null);
    expect(calls).toEqual(["askPrepare"]);
  });
});
