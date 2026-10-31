# Prompt 17: Tibo core

You are building step 17 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Tibo, AI usage quota) and
`notes/architecture.md` (§7 Tibo, §8 quota). Steps 1–16 should be ticked in
Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before any deploy.**
- **Load the `frontend-design` skill** for the UI.
  - Follow the tokens in `web/src/styles.css`.
  - Use shadcn components (the AI components already installed: Message, Bubble, Message Scroller, Trace…).
  - No external assets.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- Agents SDK knowledge may be outdated. Use the `cloudflare:agents-sdk` skill and the current docs, and check the installed `agents` package source in `node_modules` before relying on an API.

## Goal

Replace the demo `ChatAgent` with **Tibo**:
- one never-ending thread per user;
- human-feeling chunked replies with a typing indicator;
- the persona;
- quota enforcement.

Tibo is available in the side panel on every page and at `/inbox`. Tools (step 18) and long-term memory (step 19) come next, so design the turn pipeline so they plug in cleanly.

## What exists (read these)

- **`api/src/agent.ts` and `api/src/AgentWorker.ts`**: the demo `ChatAgent` (`AIChatAgent`), the rate limit and the gateway.
  - **Keep the model setup.** Muse Spark 1.3 only speaks the OpenAI **Responses** format. The working pattern is `@ai-sdk/openai` `createOpenAI({ fetch }).responses("meta/muse-spark-1.3")`, where `fetch` calls `env.AI.run(model, body, { gateway: { id, metadata }, extraHeaders: { "cf-aig-no-wholesale": "true" }, openaiEndpoint: "/v1/responses", returnRawResponse: true })`.
  - The Agents SDK's `createAI` **cannot** read this model's replies.
  - The `cf-aig-no-wholesale` header keeps billing on BYOK. Keep it.
- **`web/src/server.ts`**: the `/agents/*` proxy. It checks the origin, requires an onboarded session, and **rewrites the instance name to the session's user id**.
- **`web/src/components/agent-chat.tsx`** and the side panel and `/inbox` placeholders from step 2.
- **The usage domain and the UI limit notice** from step 16.

## Build

### 1. The `TiboAgent` Durable Object (in AgentWorker)

- **Base class**: extend the Agents SDK's base `Agent`, **not** `AIChatAgent`. `AIChatAgent` keeps the whole history in memory and sends it all to the model every turn, and Tibo's single thread must last for years.
  - Evaluate `@cloudflare/think` briefly. Use it only if it clearly fits and I approve the dependency.
- **SQLite tables**, created in `onStart` with `this.sql`:
  - **`messages`**:
    - `id`, `turn_id`;
    - `role` (`user` | `tibo` | `system_event`);
    - `body`, `created_at`, `meta`.
    - A Tibo turn produces **several bubble rows**.
  - **`messages_fts`** (FTS5, kept in sync) for step 19's search. Confirm FTS5 is available in DO SQLite; if it isn't, note it for step 19.
- **WebSocket protocol**: a small typed protocol between the client and the agent.
  - **Client → agent**: `send { text, clientId }`, `loadOlder { beforeId }`.
  - **Agent → client**:
    - `history` (the latest ~50 messages on connect);
    - `older`;
    - `typing { on }`;
    - `bubble { message }`;
    - `turnDone`;
    - `usage { remaining, limit }`;
    - `limitReached`;
    - `error`.
  - **Broadcast** to every connection of this user, so the side panel, `/inbox` and other tabs stay in sync.
- **Turn pipeline**:
  1. Save the user message.
  2. Check `CHAT_RATE_LIMIT`, then check the quota with `canSpend`. If out of quota, send `limitReached` and stop. Don't call the model.
  3. Build the context: the persona system prompt, the current date and time in the user's time zone, and the **last ~40 messages**. Steps 18 and 19 add the today snapshot, summaries, memories and tools here, so make this a function with clear inputs.
  4. Call the model, streaming.
  5. **Split the reply into bubbles**. Either:
     - ask the model to separate bubbles with a delimiter (for example a line containing only `---`), parsed while streaming; or
     - use a `send_message` tool, if tool calling proves reliable.

     Pick the more robust option and explain why. Cap bubbles per turn at about 5.
  6. For each bubble: send `typing on`, wait a delay based on its length (a natural reading and typing pace, capped), then send the `bubble` and save it.
  7. Record **one** message of usage (2 units, reason `tibo_reply`). Send `turnDone` and `usage`.
  8. If a new user message arrives mid-turn, queue it. Don't run two turns at once.
- **Errors**: if the model fails, send one Tibo-styled error bubble that **is not saved and not charged**.
- **No clear-history and no "new chat"**: one thread forever.

### 2. Persona (system prompt)

- **Who Tibo is**: quirky, overconfident, funny, a little unhinged; a chaotic best friend who still gets things done.
- **Never**:
  - swears;
  - uses slurs or meanness;
  - references any TV character or catchphrase.
- **Style**:
  - short chat bubbles, not essays;
  - Markdown sparingly;
  - addresses the user by first name now and then.
- **Drops the act** and is direct, warm and supportive if the user seems to be in real distress. Points to professional help when appropriate.
- **Never claims to have done something it didn't do.** It has no tools until step 18, so until then it says it can't do actions yet.
- Keep the prompt in its own module (`api/src/tibo/persona.ts`), so it's easy to tune.

### 3. Wiring

- **Bindings**: in `AgentWorker.ts`, replace `ChatAgent` with `TiboAgent`.
  - Removing the old Durable Object class needs a DO migration that deletes it. Check how Alchemy handles that, and tell me the plan before deploying anywhere.
- **Proxy**: update `web/src/server.ts` so it allows `tibo-agent` instead of `chat-agent`, still pinned to the session user.
- **Account deletion**: implement step 13's `onAccountDeleted` seam to wipe the user's `TiboAgent` storage (for example an internal call that runs `this.ctx.storage.deleteAll()`).

### 4. UI

- **One `TiboThread` component** used by both the side panel (every `_app` page) and `/inbox`, the focused full-page view.
- **Bubbles**:
  - Tibo's bubbles on the left with a small Tibo avatar mark (local, no external assets); the user's on the right.
  - Consecutive bubbles are grouped, with timestamps on hover or tap.
  - Day separators.
- **Typing indicator**: an animated three-dot bubble, respecting reduced motion.
- **Older messages**: scrolling up loads older messages (`loadOlder`) while keeping the scroll position.
- **Composer**:
  - Enter sends, Shift+Enter adds a new line.
  - A small "N messages left" hint when the user is low (for example under 30).
  - On `limitReached`, the step 16 notice (UI-only, never stored) replaces the composer.
- **Unread dot** on the Tibo button when a Tibo bubble arrives while the panel is closed. This becomes important in step 20.
- Remove the demo `AgentChat` and its now-unused pieces. Ask before removing packages that are no longer used.

## Acceptance

- [ ] The thread persists across reloads and devices, and the side panel and `/inbox` stay in sync live.
- [ ] Replies arrive as several bubbles with typing pauses, in Tibo's voice, with no swearing.
- [ ] Scrolling up loads older history.
- [ ] Quota: with the override set to 2, the third message shows the limit notice. Nothing about the notice is stored.
- [ ] A model failure doesn't charge usage.
- [ ] Another user can never reach your thread. Test with two accounts, including a forged agent name.
- [ ] The typecheck passes.

## When done

- Tick step 17 in Status.
- Log decisions (base class, bubble splitting method, DO migration).
- Summarize the turn pipeline's extension points for steps 18 and 19.
