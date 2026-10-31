# Prompt 20: Tibo proactivity

You are building step 20 of Dueboard's v1. Before anything else, read
`AGENTS.md`, `notes/planning.md` (Tibo: proactive, quota) and
`notes/architecture.md` (§7.8, §8). Steps 1–19 should be ticked in Status. If
they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before any deploy.**
- **Load the `frontend-design` skill** for any UI.
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.
- Check the current Agents SDK scheduling docs and the installed source.

## Goal

Tibo reaches out first, at the right moments, without spamming or using up the quota.

## Build

### 1. Schedules in `TiboAgent`

Use Agents SDK scheduling and DO alarms, all computed in the user's time zone (re-scheduled when it changes):

- **Morning plan**: at a user-chosen time (default 8:00), a short plan for the day from the today snapshot.
- **Deadline nudges**: for tasks with a deadline today that are still open, one nudge in the afternoon. Dates have no times, so pick a sensible local time and note the decision.
- **Evening habit check**: if due habits aren't done (default 20:00).
- **Session ended**: the session sweep (step 10's `onSessionCompleted` seam) and the session service notify the user's `TiboAgent` through the internal path, and Tibo congratulates them or asks how it went.

### 2. Rules for reaching out

- **Daily cap** on Tibo-initiated messages, a config value (for example 3/day).
- **Quiet**: never while the user is mid-conversation (a message in the last 10 minutes). Skip if there's nothing useful to say.
- **Quota**: each proactive turn counts against the monthly quota (reason `tibo_proactive`). If the quota is exhausted, skip silently.
- **Delivery**: messages go into the single thread as normal Tibo bubbles, and the unread dot from step 17 lights up. Push notifications come in step 23; leave a seam (`notifyUser`).

### 3. Settings

`/settings` → Tibo:
- a proactive messages on/off switch;
- the morning time and evening time;
- each kind on or off.

Stored in a table (or `user_settings` columns) through the domain services and read by the DO.

### 4. Robustness

- Alarms re-arm after firing.
- Schedules are rebuilt if settings change.
- Missed alarms (if the DO was evicted) don't burst-send old messages.

## Acceptance

Use a dev-only "fire now" trigger to test each kind. Then confirm:
- [ ] Each message kind arrives correctly.
- [ ] The daily cap and quiet rule hold.
- [ ] Usage is recorded.
- [ ] Changing settings re-schedules.
- [ ] The typecheck passes.

## When done

- Tick step 20 in Status.
- Log decisions (default times, caps).
- Summarize.
