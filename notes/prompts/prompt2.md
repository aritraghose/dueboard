# Prompt 2: App shell and design system

You are building step 2 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` and `notes/architecture.md`. Step 1 should be
ticked in `notes/planning.md` → Status. If it isn't, stop and tell me.

## Rules

- **Ask me before installing any dependency** (exact package and version), including any new shadcn components that bring packages. Use `bun add <pkg> --catalog` from `web/`, with a version older than 2 days.
- **Load the `frontend-design` skill** before designing.
  - Follow and extend the centralized tokens in `web/src/styles.css`.
  - Use shadcn components.
  - **No external assets, fonts, CDNs or links.**
- Confirm before any deploy.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Give Dueboard its visual identity and the frame every page lives in:
- the `_app` layout with navigation;
- the Tibo button and side panel placeholder;
- the `/now` page skeleton with the date navigator.

## Read first

- `web/src/styles.css`: the current tokens and the shadcn setup.
- `web/src/routes/__root.tsx` and `web/src/routes/_app/route.tsx` (the guard).
- `web/src/routes/_app/now.tsx`, from step 1.
- `web/src/components/ui/`: the shadcn components already installed.
- `web/src/components/agent-chat.tsx`: the demo chat.
- The Bootstrap RPC from step 1, which provides settings, tags and the time zone.

## Build

### 1. Design direction

- Dueboard is an "operating system for your life": calm, focused, personal, a bit playful (Tibo is quirky).
- Follow the frontend-design skill's process: propose a short token plan (color, type, layout, principles), check it against the brief, then build.
- Put the tokens in `styles.css`, in light and dark mode. The theme provider already exists.
- Define the **tag color palette** from step 1 as tokens, so tag chips look right in both modes.

### 2. `_app` layout

- A top bar with the brand and primary navigation:
  - `/now`, `/tasks`, `/habits`, `/goals`, `/notes`, `/sessions`, `/diary`;
  - `/inbox` and `/settings`, reached from a user menu or secondary navigation.
- The user menu holds:
  - the profile link `/@username` (the page is built in step 13);
  - settings;
  - the theme switcher;
  - **sign out**.

  This replaces the temporary profile card, so delete that card.
- **Mobile**: the navigation must work at phone width, for example as a bottom bar or a menu. No horizontal scrolling.
- Visible keyboard focus. Reduced motion respected.

### 3. Tibo button and side panel

- A **Tibo button at the top right** of every `_app` page opens a right-side panel (shadcn Sheet, or a resizable panel on desktop).
- Until step 17, the panel hosts the existing demo `AgentChat`. Move it out of `/now`.
- `/inbox` gets a full-page placeholder that renders the same chat.
- Rename visible strings from "Assistant" to **Tibo**. Keep the backend `ChatAgent` as it is; step 17 replaces it.

### 4. Pages that don't exist yet

Create routes for `/tasks`, `/habits`, `/goals`, `/notes`, `/sessions`, `/diary` and `/settings`. Each shows a well-designed empty state, so the navigation works.

### 5. `/now` skeleton

- **Top center**: the selected date ("Sun, Nov 1") with the local time ticking under it, and ← → buttons around it.
- **Selected date**:
  - Kept in the URL as a validated search param (`?date=YYYY-MM-DD`). With no param, it's today in the user's time zone (from settings).
  - A "Today" control appears when you're off today.
  - The keyboard ← and → keys move between days, except while typing in a field.
- **Section frames, with placeholder contents**:
  - Tasks (with Settled)
  - Unscheduled
  - Habits
  - Goals
  - Focus session
  - Live, which can be minimized. Save the minimized state per viewer in `localStorage`, wrapped in try/catch.
  - An "Upcoming" entry point.
- Design the layout for how it will be used: a focused main column (tasks, habits, goals) plus a side or secondary area for the session and Live on wide screens, all stacking on mobile.

### 6. Shared hooks

- **Time zone hook**: reads it from Bootstrap. All date display uses the user's time zone.
- **Date formatting helpers**: a weekday-first format ("Sun, Nov 1"). Weeks start on Sunday.

## Acceptance

- [ ] Every nav item routes to a page, and sign out works from the user menu.
- [ ] The Tibo button opens the side panel with the working demo chat, and `/inbox` shows it full-page.
- [ ] `/now` date navigation updates the URL and works with keyboard and buttons. Local time ticks.
- [ ] It looks right in light and dark mode, and at 375px width.
- [ ] The typecheck passes (with dev servers stopped).

## Out of scope

- Real data in the sections (later steps).
- The profile page (step 13).

## When done

- Tick step 2 in Status.
- Note design decisions (the token plan) in `notes/planning.md`'s Decision log.
- Summarize.
