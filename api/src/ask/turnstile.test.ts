import { describe, expect, test } from "bun:test";
import { verifyTurnstile } from "./turnstile.ts";

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const check = { secret: "s", token: "tok", remoteIp: "1.2.3.4", hostnames: ["dueboard.example"] };

describe("verifyTurnstile", () => {
  test("passes a successful token for the Ask action on this site", async () => {
    let sent: URLSearchParams | undefined;
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ success: true, action: "ask", hostname: "dueboard.example" }));
    }) as unknown as typeof globalThis.fetch;
    expect(await verifyTurnstile({ ...check, fetch })).toBe(true);
    expect(sent?.get("secret")).toBe("s");
    expect(sent?.get("response")).toBe("tok");
    expect(sent?.get("remoteip")).toBe("1.2.3.4");
  });

  test("fails closed", async () => {
    const ok = { success: true, action: "ask", hostname: "dueboard.example" };
    expect(await verifyTurnstile({ ...check, fetch: reply({ ...ok, success: false }) })).toBe(false);
    expect(await verifyTurnstile({ ...check, fetch: reply({ ...ok, action: "signup" }) })).toBe(false);
    expect(await verifyTurnstile({ ...check, fetch: reply({ ...ok, hostname: "evil.example" }) })).toBe(false);
    expect(await verifyTurnstile({ ...check, fetch: reply(ok, 500) })).toBe(false);
    expect(await verifyTurnstile({ ...check, fetch: reply("not json") })).toBe(false);
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile({ ...check, fetch: broken })).toBe(false);
  });

  test("refuses a missing or oversized token without calling out", async () => {
    let called = false;
    const fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof globalThis.fetch;
    expect(await verifyTurnstile({ ...check, token: undefined, fetch })).toBe(false);
    expect(await verifyTurnstile({ ...check, token: "x".repeat(2049), fetch })).toBe(false);
    expect(called).toBe(false);
  });
});
