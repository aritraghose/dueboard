# Prompt 14: Visibility module and timeline

You are building step 14 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (the Privacy and timeline table) and
`notes/architecture.md` (§5, which is authoritative). Steps 1–13 should be
ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Load the `frontend-design` skill** for the UI.
  - Follow the tokens in `web/src/styles.css`.
  - Use shadcn components.
  - No external assets.
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

1. Build one visibility module that every cross-user read goes through.
2. Build the timeline on `/now`.

## Build

### 1. `api/src/domain/visibility.ts`

- **Pure rules** (`visibility-rules.ts`) with exhaustive `bun test` tables, covering:
  - `canSeeItem(viewerId | null, ownerId, privacy, { connected, blocked })`;
  - `timelineDisplay(viewerId, ownerId, privacy)` → `full` | `redacted`, which only applies when `share_to_timeline` is true.
- **SQL helpers**: build the "visible to viewer" conditions so filtering happens **in the database**, not after loading rows.
  - This matters for pagination and for privacy.
  - Every later reader (diary, profile, Tibo tools, Ask context) must use these helpers.

### 2. Timeline backend

- **`GetTimeline({ date?, onlyMine, cursor })`**: activity rows from the viewer and their connections, excluding blocks, where the subject item's `share_to_timeline = true`, newest first, cursor-paginated.
- **Joins**: join each activity kind to its subject table, to read the title, privacy and share flag at read time.
  - Activity whose subject was deleted never appears (it's deleted with the subject; double-check).
- **Each row returns**:
  - actor (username, display name, avatar);
  - kind;
  - `occurred_at`;
  - `display: full | redacted`;
  - the title only when the display is full;
  - `meta`, for example a goal's percentage or a session's minutes.
- **Which dates the feed covers**: the timeline follows the **selected date** on `/now` (that day's events in the viewer's time zone), and today's feed refreshes live.
  - This is a decision made for this plan. Confirm it with me before building. The alternative is a continuous feed that ignores the date.

### 3. Timeline UI on `/now` (the slot from step 2)

- **Event sentences**: "ar1tra settled a task: add rate limiter", "ar1tra completed a habit", "ar1tra reached 40% on a goal", "ar1tra started a 25-minute focus session", "ar1tra wrote a note: …".
  - Redacted events drop the title: "ar1tra settled a task".
  - Each has a timestamp in the viewer's time zone, relative for today (for example "12 min ago").
  - Each has an avatar that links to `/@username`.
- **Controls**:
  - an **Only mine** toggle;
  - **minimize/expand**, which already exists, persisted per viewer.
- Polls every 30–60 s while visible and today is selected, and pauses while the tab is hidden.
- Empty state for when you have no connections: points to people search in `/settings`.

## Acceptance

- [ ] Visibility tests cover every privacy × share × relationship combination, including blocked and logged-out.
- [ ] With two test accounts:
  - public+share shows the full text;
  - private+share is redacted;
  - share=no never shows;
  - changing an item's privacy changes the timeline immediately;
  - non-connections never appear.
- [ ] Only mine works.
- [ ] The typecheck passes.

## When done

- Tick step 14 in Status.
- Log decisions (timeline date behavior).
- Summarize.
