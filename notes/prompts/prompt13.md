# Prompt 13: Profiles, connections, blocks and settings

You are building step 13 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Profile, Connections, Privacy) and
`notes/architecture.md` (§4 connections and blocks, §6 routes, §9 rate limits).
Steps 1–12 should be ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Load the `frontend-design` skill** for the UI.
  - Follow the tokens in `web/src/styles.css`.
  - Use shadcn components.
  - **No external assets.** Avatars come from the user's Google image URL that's already stored, with `referrerPolicy="no-referrer"`, plus an initials fallback.
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

The social graph and the user's own controls:
- profile pages at `/@username`;
- connection requests, connections and blocks;
- a real `/settings` page;
- account deletion.

## Build

### 1. Schema

- **`connection_requests`**:
  - `id`, `from_user_id`, `to_user_id`;
  - `status` (`pending`/`accepted`/`declined`/`cancelled`);
  - `created_at`, `responded_at?`;
  - a partial unique index so there's at most one pending request per ordered pair.
- **`connections`**:
  - `user_low`, `user_high` (`CHECK user_low < user_high`), `created_at`;
  - PK `(user_low, user_high)`.
- **`blocks`**: `blocker_id`, `blocked_id`, `created_at`, PK on the pair.

### 2. Domain: `api/src/domain/social.ts`

- **Requests**:
  - `sendConnectionRequest(toUsername)`;
  - if a reverse pending request exists, accept both into a connection instead;
  - rejected if blocked either way, or already connected.
- `accept`, `decline`, `cancel`, `removeConnection`.
- `block` (also removes any connection and pending requests) and `unblock`.
- `areConnected(a, b)` and `isBlocked(a, b)`, used by visibility in step 14.
- `listConnections`, `listIncomingRequests`, `listOutgoingRequests`, `listBlocked`.
- **Rate limit**: a new binding with namespace **1006**, keyed by user (for example 20 requests/day), on sending requests. Register it in architecture §9.
- **Profile read**: `getProfile(viewer?, username)` returns:
  - display name, username, avatar, join date;
  - the connection state with the viewer (none / pending-out / pending-in / connected / blocked);
  - simple public counts.

  It works for **logged-out** viewers, who get public data only. It returns a not-found shape for blocked viewers.

### 3. RPCs

- The social actions, as RPCs.
- **Public profile read**:
  - The existing RPC middleware requires sign-in. Add a separate, clearly named route or RPC group for public reads with optional auth.
  - Apply a per-IP rate limit (namespace **1008**) for logged-out access.
  - Keep authenticated-only RPCs unchanged.

### 4. Routes

- **`/@username`**:
  - Readable when signed in or out. Check TanStack Router's syntax for a literal prefix plus a param, for example `@{$username}`.
  - Shows the profile card and connection actions (Connect / Pending / Accept / Connected ▾ remove / Block).
  - Leaves placeholders for the diary and contribution graph (step 15).
  - It sits outside `_app`'s guard, but uses the app chrome when signed in.
- **`/settings`**, with tabs:
  - **General**:
    - default privacy and default shareToTimeline;
    - the time zone (display only, auto-detected);
    - the theme.
  - **Tags**: create, rename and recolor tags. System tags can only be recolored.
  - **Connections**: lists, requests, blocked users.
  - **Tibo**: relay policy (connections / anyone / none, default connections). It's used in step 21; store it now.
  - **Account**: delete the account, with a strong confirmation such as typing the username.
- A **people search** (by exact username or prefix, rate limited) to find users to connect with.

### 5. Account deletion

- Deletes every row the user owns in every table, then their Better Auth user.
- Signs them out.
- Leave a clearly named seam (`onAccountDeleted(userId)`). Step 17 uses it to wipe the user's `TiboAgent` Durable Object.

## Acceptance

- [ ] Two test accounts can request, accept, remove, block and unblock each other.
- [ ] Blocked users can't see each other's profiles, and requests are refused.
- [ ] Logged-out visitors can view `/@username`.
- [ ] Settings save, and new tasks, habits, goals, notes and sessions use the new defaults.
- [ ] Account deletion removes all the user's data.
- [ ] The rate limits are registered.
- [ ] The typecheck passes.
- [ ] The migration is generated.

## When done

- Tick step 13 in Status.
- Log decisions (public RPC design, profile URL syntax).
- Summarize.
