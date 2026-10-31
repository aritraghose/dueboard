# Prompt 24: Hardening and launch readiness

You are building step 24, the last step of Dueboard's v1. Before anything else,
read `AGENTS.md`, `notes/planning.md` and `notes/architecture.md`. Steps 1–23
should be ticked in Status. If they aren't, stop and tell me.

## Rules

- **Ask me before installing any dependency.**
- **Confirm with me before each deploy, one at a time** (api stack first, then web).
- Low-RAM machine: no `tsc -b` or build while `alchemy dev` runs.
- Ask before committing.

## Goal

Make v1 safe, consistent and deployable, and leave the notes accurate for whatever comes next.

## Do

### 1. Security review

Review the whole app. You may run the `security-review` skill. Check:
- every RPC is scoped to the acting user;
- every cross-user read goes through `visibility.ts`;
- the internal binding (Tibo → domain) is unreachable from browsers;
- the `/agents/*` proxy pins `tibo-agent` to the session user and computes `ask-agent` names server-side;
- origin checks;
- Turnstile verification;
- prompt-injection boundaries (relays, Ask page, timeline text reaching Tibo);
- secrets are never exposed to the client;
- error messages never leak internals.

Fix what you find, or list it for me.

### 2. Limits and quota audit

- Every public path is rate limited.
- §9 matches the code.
- The quota covers every AI feature, and nothing stored contains the limit notice.

### 3. Consistency

- Activity is written and deleted correctly for every kind.
- Account deletion wipes Postgres, `TiboAgent`, `AskAgent` instances, Vectorize and push subscriptions.
- Time zones: test a user in a far-ahead zone and one in a far-behind zone.

### 4. Performance

- Check the slow queries: timeline, diary, graph, `GetDay`, `GetUpcoming`. Add missing indexes.
- Check that `/now` uses one aggregate request.

### 5. Accessibility and responsive pass

- Keyboard navigation everywhere.
- Focus rings.
- Reduced motion.
- 375px layouts.
- Light and dark contrast.

### 6. Staging deploy

- Plan the `staging` stage, including `AUTH_BASE_URL`, Google OAuth redirect URIs, the AI Gateway BYOK key for the staging gateway, Turnstile keys and VAPID secrets.
- Walk me through it and **ask before each deploy**.
- After deploying, smoke-test the main flows with me.

### 7. Docs

Update `README.md`, `notes/architecture.md` and `notes/planning.md` (Status, Decision log) so they describe the app as built. Include a short "Next" list:
- Gmail and Calendar integrations
- Tibo's 24/7 VM
- payments and plans
- a native app

## When done

- Tick step 24 in Status.
- Summarize what's ready, what's risky, and what I should do before launch.
