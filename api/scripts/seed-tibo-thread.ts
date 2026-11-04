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
