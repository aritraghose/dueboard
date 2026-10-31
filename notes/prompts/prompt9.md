# Prompt 9: Notes

You are building step 9 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Notes) and `notes/architecture.md` (§4 notes,
§5). Steps 1–8 should be ticked in Status. If they aren't, stop and tell me.

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

Short notes, at most 60 characters each and several per day, each with privacy and shareToTimeline. Notes appear in the diary and on the timeline (later steps).

## Build

### 1. Backend

- **Schema `notes`**:
  - `id`, `user_id`;
  - `body` (1–60 chars, `CHECK char_length(body) <= 60`);
  - `local_date` (the user's local date when written);
  - `privacy`, `share_to_timeline`;
  - `created_at`, `updated_at`;
  - an index on `(user_id, local_date)`.
- **Service `api/src/domain/notes.ts`**:
  - `createNote` records a `note_created` activity.
  - `updateNote` covers body, privacy and share.
  - `deleteNote` also deletes the activity.
  - `listNotesForDay(date)`.
  - `listNotes`: cursor-paginated, grouped by day, with text search.
  - Notes can only be **created for today** (in the user's time zone). Editing and deleting past notes is allowed.
  - A sensible per-day cap (for example 50) prevents abuse.
- **RPCs**: `CreateNote`, `UpdateNote`, `DeleteNote`, `ListNotesForDay`, `ListNotes`.

### 2. UI

- **`/notes` page**:
  - A composer for today with a live character counter (60 max) and privacy and share controls (defaults from settings).
  - Notes grouped by day, newest first, with search, inline edit and delete.
- **`/now`**: the spec doesn't put notes in the main column. Add a compact "Note" quick-add (in the header actions or the timeline area) that writes a note for today, and show today's notes count, without cluttering the page. Briefly propose the placement to me before building it.

## Acceptance

- [ ] Creating, editing, deleting and searching notes works.
- [ ] The 61st character is rejected by both the UI and the API.
- [ ] Activity rows match the notes.
- [ ] The typecheck passes.
- [ ] The migration is generated.

## When done

- Tick step 9 in Status.
- Log decisions.
- Summarize.
