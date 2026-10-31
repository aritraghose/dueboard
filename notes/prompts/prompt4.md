# Prompt 4: Tasks UI

You are building step 4 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Tasks, `/now`) and `notes/architecture.md`.
Steps 1–3 should be ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency**, including shadcn components that add packages.
- **Load the `frontend-design` skill.**
  - Follow the tokens in `web/src/styles.css` (set in step 2) and extend them there.
  - Use shadcn components.
  - No external assets.
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Tasks become usable end to end:
- on `/now` for the selected date (Tasks with Settled, and Unscheduled);
- the task card;
- the `/tasks` page.

## Read first

- The step 3 RPCs in `api/src/rpc.ts`.
- `web/src/rpc-client.ts`: the AtomRpc query and mutation patterns.
- `web/src/routes/_app/now.tsx` and its layout from step 2.
- The design tokens in `styles.css`.

## Build

### 1. Task row (minimal)

- A settle checkbox, then the title.
- Then **only the fields that are set**: tag chip (hide it when the tag is `default`), importance stars, expected duration, a deadline badge ("Due today" / date), and a `working` label.
- Unset fields never show.
- Settling animates the row into the Settled list, a motion that answers the user's action.

### 2. `/now` sections

- **Tasks** for the selected date: the open tasks.
- **Settled**: collapsible, with a count.
- **Unscheduled**: open tasks with no dates. Show it on every day, or only today. Pick one and note the decision.
- **Quick add**: type a title and press Enter.
  - The task is assigned to the selected date by default, with a one-click toggle to make it unscheduled.
  - Optional inline chips for deadline, tag and importance.
- Keyboard-friendly.

### 3. Task card

Opens on click: a Sheet on mobile, a Dialog or side sheet on desktop.

- Shows **every** field, including unset ones as "Not set", each editable:
  - title
  - description
  - assigned date
  - deadline (date pickers enforce "assigned ≤ deadline")
  - tag picker with colors, and **inline tag creation**
  - status (`idle` / `working` / `settled`)
  - privacy
  - shareToTimeline
  - importance (1–5 stars)
  - expected minutes
- Delete, with a confirmation.
- Validation errors from the API show inline.

### 4. `/tasks` page

- Filters: All, Unscheduled, Upcoming, Settled, by tag.
- Title search.
- Cursor pagination ("Load more").
- Group by date where it helps.
- Opens the same task card.

### 5. Data behavior

- Mutations update the visible lists right away, by refreshing atoms or updating optimistically.
- Errors show in the existing toaster.
- Empty states tell the user what to do next.

## Acceptance

- [ ] Create, edit, settle, un-settle and delete all work on `/now` and `/tasks`.
- [ ] Changing the date with ← → shows the right tasks.
- [ ] A task with both an assigned date and a deadline shows on both days.
- [ ] Unset optional fields are hidden in rows but visible in the card.
- [ ] It works at 375px and in dark mode.
- [ ] The typecheck passes.

## Out of scope

- Habits, goals and the timeline.

## When done

- Tick step 4 in Status.
- Log decisions (for example, whether Unscheduled shows every day).
- Summarize.
