Helpful resources to build apps using Alchemy on Cloudflare:
- For anything Alchemy related (Cloudflare deep-dives, guides, concepts), fetch https://alchemy.run/llms.txt — it's the index of the guide and concept docs. Use it to look up the specific page you need instead of guessing URLs. The per-resource API reference is indexed separately in https://alchemy.run/llms-full.txt — it's large, so only fetch it when you need a specific resource's reference page.

Important:
- Confirm with me before each deploy. Don't batch.
- Do NOT instruct me to export CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Alchemy stores credentials in profiles — `alchemy profile edit` (or the first `alchemy deploy`) prompts interactively for OAuth or an API token and saves it to ~/.alchemy/profiles.json.
- This project uses Bun.
- Never add, install or upgrade any dependency without asking me first (security and supply-chain safety): name the package and why it is needed, then wait for my yes.
- Add dependencies with `bun add <pkg> --catalog` (add `-d` for dev dependencies), run from the workspace that needs them (`api/` or `web/`).
- Follow centralized styling conventions from `web/src/styles.css`, and update it accordingly if needed.
- Do not use external assets or dependencies in UI code or anywhere (no external SVGs, images, fonts, or links/CDNs); use only local/project resources.
- For design-oriented tasks, AI agents must follow the `frontend-design` skill.
- Git: one logical change per commit, with a one-line Conventional Commits message under 72 characters and no body (`feat: add habit streaks`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`).
  Commit or push only when I ask; never force-push or rewrite history on `main`, and never commit secrets or build output.
- This machine has about 7 GiB of RAM: never run `tsc -b`, a full build or other heavy commands while `alchemy dev` servers are running, and run heavy commands one at a time.
