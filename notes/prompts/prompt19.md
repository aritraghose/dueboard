# Prompt 19: Tibo long-term memory

You are building step 19 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Tibo: one thread forever, remembers years
back) and `notes/architecture.md` (§7.2 storage, §7.3 context). Steps 1–18
should be ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency, and before choosing the embedding model.** It's a Workers AI model, not Meta. I've said "only Muse Spark" for chat, so get my explicit OK on the embedding model and its cost.
- **Confirm with me before any deploy.**
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- Check the current Alchemy docs (Vectorize resource), the Agents SDK docs (scheduling) and the Vectorize docs before using them.

## Goal

Tibo remembers what was said a minute ago and years ago, without ever sending the whole history to the model.

## Build

All of this lives in `TiboAgent`'s SQLite, plus Vectorize.

### 1. Summaries (rolling, hierarchical)

- **Table** `summaries`: `level` (`day`|`week`|`month`|`year`), `period_start`, `text`, `through_message_id`, `updated_at`.
- **Background job**, scheduled with Agents SDK `schedule` or alarms, never blocking a reply:
  - after a day ends, or when the unsummarized message count passes a threshold, summarize that day's messages into a **day** summary;
  - roll days into a **week**, weeks into a **month**, and months into a **year**.
- Summaries keep names, dates, commitments, feelings and decisions. They are written in the third person about the user.

### 2. Memories (lasting facts)

- **Table** `memories`:
  - `id`, `text`;
  - `kind` (`fact`|`preference`|`person`|`event`|`plan`);
  - `created_at`, `updated_at`, `superseded_by?`;
  - `source_message_ids`.
- **Extraction job**: after turns, in batches, pull lasting memories from new messages.
  - **Dedupe** against similar existing memories found with embeddings.
  - **Supersede** contradicted ones instead of keeping both ("moved to Boston" supersedes "lives in NYC").
- **Embeddings**:
  - Embed memories and also message chunks.
  - Store them in a **Vectorize** index (an Alchemy resource) with **namespace = user id**, plus metadata (`kind`, `created_at`, type `memory`|`message`).
  - Each vector id maps back to a row.

### 3. Conversation search tool

- **`search_conversation({ query, from?, to? })`**: combines FTS5 keyword search over `messages_fts` with Vectorize semantic search over message chunks.
  - Results are filtered by date when given.
  - Returns short excerpts with dates.
- This is how "what did I tell you about X in 2025?" works.

### 4. Context assembly

Extend step 17's context builder, within a total token budget:
- persona;
- the today snapshot (step 18);
- **the story so far**: the latest year, month, week and day summaries;
- **relevant memories**: top-k from Vectorize for the incoming message, plus recent important ones, excluding superseded memories;
- the recent ~40 messages;
- tools.

Log the token sizes of each section in development so the budget can be tuned.

### 5. User control

- Tibo has `remember` and `forget` tools: "remember that…", "forget that I…".
- A **Memory** list in `/settings` → Tibo where the user can see and delete memories. This is an RPC through the internal binding to the user's DO.
- Account deletion (step 17's seam) also deletes the user's Vectorize namespace.

### 6. Costs

- Background jobs use Muse Spark (the only chat model) and do **not** count toward the user's quota.
- Add an internal per-user daily cap on background jobs so they can't run away.

## Acceptance

- [ ] Seed a long synthetic thread (a dev-only script that inserts messages with past dates into a test user's DO). Tibo correctly answers questions about early facts, through memory and search.
- [ ] Summaries roll up correctly.
- [ ] Superseding works.
- [ ] Context stays under budget.
- [ ] Memories can be viewed and deleted in settings, and deleting the account removes the vectors.
- [ ] The typecheck passes.

## When done

- Tick step 19 in Status.
- Log decisions (embedding model, budgets, thresholds).
- Summarize.
