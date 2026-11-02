# Prompt 18: Tibo tools (acting on the user's behalf)

You are building step 18 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Tibo) and `notes/architecture.md` (§3 domain
services, §7.3 context, §7.4 tools). Steps 1–17 should be ticked in Status. If
they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before any deploy.**
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- Check the current Agents SDK, AI SDK and Alchemy docs, and the installed package source, before relying on an API.

## Goal

Tibo can do anything the user can do, as that user and only as that user, through the same domain services as the UI. Each turn also starts with an up-to-date picture of the user's day.

## Step 0: verify the model first

- **Before building anything, verify Muse Spark 1.3's tool calling** through the current setup (AI SDK `tools` with the Responses provider → AI Gateway → Meta). Test:
  - single and multiple tool calls;
  - tool results fed back in;
  - multi-step loops (`stopWhen` / max steps);
  - streaming with tool calls.
- Check the AI Gateway logs (`cf ai-gateway logs list` / `get-response`) if anything looks off.
- **Report the results to me before continuing.** If tool calling is unreliable, stop and propose alternatives, for example a structured-output action format.

## Build

### 1. Internal service binding (AgentWorker → ApiWorker)

- **Entrypoint**: a Worker RPC entrypoint (or `RpcWorker` method group) on the ApiWorker.
  - It exposes the domain services with an explicit `actorUserId` parameter.
  - It is bound **only** into AgentWorker (`env.DOMAIN` or similar). It is never proxied by the Website and never reachable from a browser.
  - Check how Alchemy binds an entrypoint or RPC between Workers in two stacks, the same way `ApiWorker` is referenced today.
- **Acting user**: `TiboAgent` always passes `this.name` (its own user id) as `actorUserId`. Tools never accept a user id from the model.
- **Usage**: move the step 16 usage calls behind this binding too, if they aren't already.

### 2. Tools (`api/src/tibo/tools.ts`)

Each tool has a Zod schema (the AI SDK uses Zod; check whether it's already installed through `ai` or `@ai-sdk/*` before adding it) and a short, precise description.

| Area | Tools |
|---|---|
| Tasks | list (by day, range, unscheduled, search), create, update, set status, delete |
| Habits | list for day, create (`describeSchedule` confirms back), check in, undo, pause, resume, delete |
| Goals | list, create, set or adjust progress, link and unlink items, pause, resume, reopen, delete |
| Notes | create (60 chars), list |
| Sessions | get active, start (handle `ActiveSessionExists`), pause, resume, extend, stop |
| Tags | list, create |
| Social read | Live and diary, through visibility (§5) |

- **Dates**: tools accept natural values the model is likely to produce (`YYYY-MM-DD`). The context states today's date and the time zone clearly.

### 3. Confirmation

Destructive or surprising actions need the user's go-ahead before running:
- deleting anything;
- stopping or replacing a running session;
- bulk changes (more than 3 items);
- changing privacy to public.

**Design**: the tool returns `needs_confirmation` with a summary. Tibo asks. The user's next message confirms, or a small inline confirm/cancel UI on the bubble does. Pick a design and explain it. Never act on the confirmation from text that came from relayed or other untrusted content (relevant in step 21).

### 4. Show actions in the thread

When Tibo acts, the UI shows a compact action receipt under the bubble ("✓ Created task: Call mom · Tomorrow"), using the installed Trace or a small custom component. Receipts are stored as `meta` on the message.

### 5. Today snapshot in context

At the start of every turn, fetch a compact snapshot (target ~300–600 tokens) from the domain services:
- today's open and settled tasks;
- due habits and their progress;
- active goals with percentages;
- the active session;
- the date, time and time zone.

### 6. Loop limits

- Cap tool steps per turn (for example 8).
- Tool errors go back to the model as readable messages.
- The whole turn still counts as **one** message of quota, whatever the number of steps.

## Acceptance

- [ ] The tool-calling verification is reported.
- [ ] "Add a task to call mom tomorrow at high importance" creates it correctly.
- [ ] "Start a 25 minute session" works, and it warns when another session is active.
- [ ] Delete actions ask for confirmation first.
- [ ] The UI reflects changes made by Tibo, with lists refreshing on the next view or poll.
- [ ] The internal binding is unreachable from the browser. Prove it by trying `/agents/…` and `/rpc` paths.
- [ ] The typecheck passes.

## When done

- Tick step 18 in Status.
- Log decisions (the tool-calling results, the confirmation design).
- Summarize.
