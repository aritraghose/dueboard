import type { AiUsageReason } from "./domain/model.ts";

// A typed client for the ApiWorker's internal path (`./internal.ts`), over
// a service binding. Plain `fetch` and JSON, so the AgentWorker's bundle
// stays free of Effect and the database code. Step 18 replaces the path
// with an internal binding behind the same calls.

export const INTERNAL_PATH_PREFIX = "/internal/";

/** `AiUsage` as JSON (`resetsAt` is an ISO string). */
export interface AiUsageJson {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly period: string;
  readonly resetsAt: string;
}

/**
 * The usage ledger's calls (`domain/usage.ts`), for code outside the
 * ApiWorker. Check with `check` before a model call, then `record` (or
 * `chargeSplit` for a relay turn) after it succeeds.
 */
export const usageClient = (api: { fetch: (request: Request) => Promise<Response> }) => {
  const call = async <A>(path: string, body: unknown): Promise<A> => {
    const response = await api.fetch(
      new Request(`https://api.internal${INTERNAL_PATH_PREFIX}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      throw new Error(`Internal ${path} failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as A;
  };
  return {
    get: (userId: string) => call<AiUsageJson>("usage/get", { userId }),
    check: (userId: string, units: number) =>
      call<{ allowed: boolean; usage: AiUsageJson }>("usage/check", { userId, units }),
    record: (userId: string, units: number, reason: AiUsageReason, ref: string | null = null) =>
      call<AiUsageJson>("usage/record", { userId, units, reason, ref }),
    chargeSplit: (
      userA: string,
      userB: string,
      unitsEach: number,
      reason: AiUsageReason,
      ref: string | null = null,
    ) => call<{ ok: true }>("usage/charge-split", { userA, userB, unitsEach, reason, ref }),
  };
};
