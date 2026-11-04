// Development only: replaces the signed-in user's Tibo thread with a
// synthetic two-and-a-half-year one (`src/tibo/dev-seed.ts`) and starts the
// memory jobs, so long-term memory can be tested against early facts.
// The agent serves `dev/*` only under `alchemy dev` (`TIBO_DEV`).
//
//   DUEBOARD_COOKIE='<your session cookie>' bun scripts/seed-tibo-thread.ts [http://localhost:1339]
//
// Or, signed in on the dev site, from the browser console:
//   await fetch("/agents/tibo-agent/me/dev/seed", { method: "POST" }).then((r) => r.json())
// Progress: GET /agents/tibo-agent/me/dev/memory

const base = process.argv[2] ?? "http://localhost:1339";
const cookie = process.env.DUEBOARD_COOKIE;
if (!cookie) {
  console.error("Set DUEBOARD_COOKIE to the dev site's session cookie (or run the fetch from the browser console).");
  process.exit(1);
}

const response = await fetch(new URL("/agents/tibo-agent/me/dev/seed", base), {
  method: "POST",
  headers: { cookie, origin: new URL(base).origin },
});
console.log(response.status, await response.text());
