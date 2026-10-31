# Prompt 11: Focus sessions UI

You are building step 11 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Focus sessions) and `notes/architecture.md`
(§11). Steps 1–10 should be ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Load the `frontend-design` skill.**
  - Follow the tokens in `web/src/styles.css`.
  - Use shadcn components.
  - No external assets.
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

A focus session widget on `/now` that's a pleasure to use, plus a `/sessions` history page.

## Build

### 1. Session widget on `/now` (the slot from step 2)

- **Idle**:
  - start with preset minutes (15 / 25 / 50 / 90) or a custom value;
  - an optional label;
  - privacy and shareToTimeline (defaults from settings).
- **Running**:
  - a big countdown computed from `ends_at`, with the browser's clock re-synced on focus and visibility change;
  - pause, extend (+5 / +15 / custom) and stop (with confirmation).
- **Paused**: shows the remaining time, plus resume and stop.
- **Done**: a completion moment, respecting reduced motion.
  - When the countdown reaches 0, refetch `GetActiveSession` so the server's completion is reflected.
- **Starting while another session is active**:
  - On `ActiveSessionExists`, show a warning dialog: the current session (label, remaining time) **will be stopped** if you start a new one.
  - Confirming retries with `replaceActive: true`.
- **Visible on every app page**: a compact running indicator in the app header, with a small timer, links to `/now`.
- Optionally set `document.title` to the remaining time while running.

### 2. `/sessions` page

- History grouped by day: label, planned vs actual minutes, and status (completed or stopped).
- Daily totals.
- Delete, with confirmation.
- Filters: completed / stopped.

### 3. On past dates in `/now`

The widget area shows that day's sessions as a list, read-only.

## Acceptance

- [ ] Start, pause, resume, extend, stop and auto-complete all work.
- [ ] The countdown stays accurate across tab sleep.
- [ ] The replace-active warning works.
- [ ] The header indicator shows on every app page.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## When done

- Tick step 11 in Status.
- Log decisions.
- Summarize.
