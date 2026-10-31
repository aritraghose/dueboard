# Prompt 16: Rate limiting pass and AI usage quota

You are building step 16 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (AI usage quota, Platform) and
`notes/architecture.md` (§8 quota, §9 rate limits). Steps 1–15 should be
ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before any deploy.**
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- For Alchemy, read `https://alchemy.run/llms.txt` and the specific pages you need.

## Goal

1. Protect the whole app from abuse.
2. Build the AI quota ledger that every AI feature (steps 17–22) will use.

## Build

### 1. Rate limit registry

- Create `api/src/limits.ts`, or a shared location both stacks can import, listing every Rate Limiting binding:
  - its name
  - its `namespaceId`
  - its limit and period
  - the key it uses (user or IP)

  Existing ones are 1003 (auth), 1004 (RPC), 1005 (chat), 1006 (connection requests) and 1008 (public reads). Refactor the existing bindings to read from it.
- **Add**:
  - **1010**: per-IP on `/agents/*` WebSocket upgrades and HTTP, in `web/src/server.ts` before the session lookup.
  - Any obvious gaps you find. Audit every public or unauthenticated path: `/api/auth/*`, `/rpc`, `/agents/*`, the public profile path.
- **Input size audit**: every RPC Schema string and array has a `maxLength`. Request bodies are limited where relevant.
- Keep architecture §9 in sync.

### 2. AI quota

- **Schema**:
  - `ai_usage`: `user_id`, `period` (`YYYY-MM` in the user's time zone), `units`; PK `(user_id, period)`.
  - `ai_usage_events`: `id`, `user_id`, `units`, `reason` (`tibo_reply` | `tibo_proactive` | `relay` | `ask_answer`), `ref?`, `created_at`.
- **Config**: `AI_MONTHLY_MESSAGE_QUOTA` (default 300).
  - Read through Effect `Config` or Alchemy env, so it changes without a code change.
  - `user_settings.ai_quota_override` replaces it for one user.
  - Units: **1 message = 2 units** (a relay turn charges 1 unit to each side).
- **Domain `api/src/domain/usage.ts`**:
  - `getUsage(userId)` → `{ used, limit, remaining, period, resetsAt }` in messages.
  - `canSpend(userId, units)`.
  - `recordUsage(userId, units, reason, ref)`: atomic upsert plus an event row.
  - `chargeSplit(userA, userB, unitsEach, ...)` for relays.
  - Design these so steps 17–22 can call them through the internal path (step 18 builds the internal binding). Until then, the agent may call an internal RPC entrypoint. Keep it unreachable from the browser.
- **Wire it into the current demo `ChatAgent`** (`api/src/agent.ts`):
  - check before each model call, and record after success;
  - when out of quota, don't call the model;
  - send the client a clear "limit reached" signal.

  Step 17 replaces this agent but keeps the same contract.
- **RPC `GetAiUsage`**: the UI can show "N of 300 messages left this month" in settings (Tibo tab) and near the composer.
- **UI limit notice**:
  - When the quota is exhausted, the chat composer disappears.
  - In its place, a notice **styled like a Tibo message bubble** says the limit is reached and more usage is coming soon.
  - It's built **in the UI only**: never sent to the model, never saved in history, memory or the database.

## Acceptance

- [ ] The limits registry exists, and §9 matches it.
- [ ] The new per-IP limit on `/agents/*` works.
- [ ] Setting a user's override to 1 lets them send one message. Then the composer disappears and the notice shows.
- [ ] Usage resets with the user's month.
- [ ] The notice never appears in stored history.
- [ ] The typecheck passes.
- [ ] The migration is generated.

## When done

- Tick step 16 in Status.
- Log decisions.
- Summarize the usage API for steps 17–22.
