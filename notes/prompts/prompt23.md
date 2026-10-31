# Prompt 23: Web push notifications

You are building step 23 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Platform) and `notes/architecture.md`
(§12). Steps 1–22 should be ticked in Status. If they aren't, stop and tell
me.

## Rules

- **Ask me before installing any dependency.** Web Push payload encryption (RFC 8291) and VAPID (RFC 8292) need either a Workers-compatible library or a careful WebCrypto implementation.
  - The popular `web-push` npm package depends on Node APIs. Check whether it works under `nodejs_compat` before proposing it.
  - Propose an option, with the trade-offs, before building.
- **Confirm with me before any deploy.**
- **Load the `frontend-design` skill** for the UI.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Tibo's proactive messages and relay events reach users even when Dueboard isn't open, implemented the safe, standard way.

## Build

### 1. Keys and storage

- A VAPID key pair, stored as Alchemy secrets: the private key is secret, and the public key is exposed to the client.
- **Schema `push_subscriptions`**:
  - `id`, `user_id`, `endpoint` (unique);
  - `p256dh`, `auth`;
  - `user_agent?`, `created_at`, `last_success_at?`.

### 2. Service worker

- A **local** file, served from the site root so its scope covers the app.
  - Check how Vite and TanStack Start serve it under Alchemy's Website.
- It handles `push` by showing a notification with a title, body and a URL to open, using a local icon file.
- It handles `notificationclick` by focusing an existing tab or opening `/inbox`.
- **Never** loads external scripts.

### 3. Opt-in UX

- **Never ask on page load.**
- Show a soft prompt in a sensible moment, for example after the user enables proactive messages, or in `/settings` → Notifications. The browser permission request only happens when the user clicks "Turn on".
- **iOS**: explain that push works after adding Dueboard to the Home Screen. This needs a web app manifest with local icons; add a minimal one.
- `/settings` → Notifications:
  - per-device on/off;
  - which kinds (Tibo proactive, relays, session done).

### 4. Sending

- **`notifyUser(userId, payload)`**: implement the seam from step 20.
  - It's called when the user has **no live connection** to their `TiboAgent`.
  - Payload: the encrypted Web Push payload, plus `TTL` and `urgency` headers.
- **Cleanup**: remove subscriptions on `404` or `410` from the push service.
- **Payloads stay minimal**: "Tibo: …" with a short preview. Respect a per-user privacy option to hide previews.
- **Limits**: rate-limit sending, and coalesce bursts.

### 5. Security

- Subscription endpoints are only accepted from authenticated RPCs.
- Validate that the endpoint is https and its host is a known push service.

## Acceptance

- [ ] On desktop Chrome or Firefox and on Android: opting in works, and closing the app then triggering a proactive message (dev trigger) shows a notification that opens `/inbox`.
- [ ] Unsubscribing works.
- [ ] Expired subscriptions are cleaned up.
- [ ] No external assets are used.
- [ ] The typecheck passes.

## When done

- Tick step 23 in Status.
- Log decisions (library choice).
- Summarize.
