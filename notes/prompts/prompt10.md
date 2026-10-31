# Prompt 10: Focus sessions backend and auto-complete sweep

You are building step 10 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Focus sessions) and `notes/architecture.md`
(§4 focus sessions, §5, §11). Steps 1–9 should be ticked in Status. If they
aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before any deploy.**
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- For Alchemy questions, read `https://alchemy.run/llms.txt` and the specific page you need. Don't guess the API.

## Goal

Focus sessions with pause, resume, extend and stop. Only one active session per
user, enforced by the database. Sessions complete automatically when their time
runs out, even if the app is closed.

## Session model (decided)

- `status`: `running`, `paused`, `completed` or `stopped`.
  - `stopped` means ended early, by the user or because a new session replaced it.
- **Segments** record each running stretch. Elapsed time is the sum of the segments.
- `ends_at`:
  - set while running (`now + remaining`);
  - null while paused;
  - recomputed on resume and extend.
- **One active session per user**: a partial unique index on `user_id` WHERE `status IN ('running','paused')`.
- **Starting while another is active**:
  - the API returns a typed `ActiveSessionExists` error carrying that session;
  - the client then confirms;
  - it retries with `replaceActive: true`, which stops the old session and starts the new one **in one transaction**.
- **Activity**:
  - `session_started` on start;
  - `session_completed` on completion;
  - `session_stopped` on stop (it doesn't count on the contribution graph).

## Build

### 1. Schema

- **`focus_sessions`**:
  - `id`, `user_id`, `label?` (≤ 100);
  - `planned_minutes` (1–600, extend adds to it), `status`;
  - `started_at`, `ends_at?`, `ended_at?`;
  - `privacy`, `share_to_timeline`;
  - timestamps.
  - Plus the partial unique index.
- **`focus_session_segments`**: `id`, `session_id`, `started_at`, `ended_at?`.

### 2. Pure rules: `session-rules.ts`

- `elapsed(segments, now)`, `remaining(...)`, `computeEndsAt(...)`.
- Tests.

### 3. Service: `api/src/domain/sessions.ts`

- `startSession({ minutes, label, privacy, share, replaceActive })`
- `pauseSession`, `resumeSession`, `extendSession(minutes)`, `stopSession`
- `getActiveSession` completes the session lazily if `ends_at <= now`, so reads are always correct.
- `listSessions`: paginated, with total focused minutes per day.
- `listSessionsForDay(date)`
- `deleteSession` (also deletes its activity)
- Guard state transitions; for example, a paused session can't be paused again.

### 4. Auto-complete sweep

- A scheduled (cron) handler runs **every minute**.
- It completes sessions with `status = running AND ends_at <= now()`:
  - closes the last segment at `ends_at`;
  - sets `ended_at`;
  - writes `session_completed`.
- **Where it runs**:
  - Check the Alchemy docs for how to add a cron trigger to a Worker in this setup (on the ApiWorker, or a small dedicated Worker in the `DueboardApi` stack).
  - Batch the updates and make them idempotent, safe to run twice.
  - Leave a clearly named seam (`onSessionCompleted`) for step 20, where Tibo sends "session done" messages.

### 5. RPCs

`StartSession`, `PauseSession`, `ResumeSession`, `ExtendSession`, `StopSession`, `GetActiveSession`, `ListSessions`, `ListSessionsForDay`, `DeleteSession`.

## Acceptance

- [ ] Rule tests pass.
- [ ] The typecheck passes.
- [ ] The migration is generated.
- [ ] The database rejects a second active session, and `replaceActive` stops the old one.
- [ ] Pause, resume and extend keep `ends_at` correct.
- [ ] Under `alchemy dev`, an expired running session gets completed by the sweep, or by the lazy read if dev doesn't run crons. If dev doesn't run crons, tell me how to trigger the sweep manually.

## Out of scope

- The UI (step 11).

## When done

- Tick step 10 in Status.
- Log decisions (where the cron lives).
- Summarize.
