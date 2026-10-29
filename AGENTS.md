Helpful resources to build apps using Alchemy on Cloudflare:

Tutorial — foundations:
  https://alchemy.run/cloudflare/tutorial/part-1  First Stack (state store + first resource)
  https://alchemy.run/cloudflare/tutorial/part-2  Add a Worker
  https://alchemy.run/cloudflare/tutorial/part-3  Testing
  https://alchemy.run/cloudflare/tutorial/part-4  Local Dev (`alchemy dev`)
  https://alchemy.run/cloudflare/tutorial/part-5  CI/CD (per-PR previews from GitHub Actions)

For everything else (Cloudflare deep-dives, guides, concepts), fetch https://alchemy.run/llms.txt — it's the index of the guide and concept docs. Use it to look up the specific page you need instead of guessing URLs. The per-resource API reference is indexed separately in https://alchemy.run/llms-full.txt — it's large, so only fetch it when you need a specific resource's reference page.

Important:
- Confirm with me before each deploy. Don't batch.
- Do NOT instruct me to export CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Alchemy stores credentials in profiles — `alchemy profile edit` (or the first `alchemy deploy`) prompts interactively for OAuth or an API token and saves it to ~/.alchemy/profiles.json.
- This project uses Bun.
- Add dependencies with `bun add <pkg> --catalog` (add `-d` for dev dependencies), run from the workspace that needs them (`api/` or `web/`).
- Follow centralized styling conventions from `web/src/styles.css`, and update it accordingly if needed.
- Do not use external assets or dependencies in UI code or anywhere (no external SVGs, images, fonts, or links/CDNs); use only local/project resources.
- For design-oriented tasks, AI agents must follow the `frontend-design` skill.
