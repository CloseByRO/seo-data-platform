# Website template pipeline

## `website-app-template.zip`

Onboarding ([`onboard-client.mjs`](../onboard-client.mjs)) requires:

`scripting/website/templates/website-app-template.zip`

That path is **gitignored** (see repo `.gitignore`). Generate it locally when missing:

```bash
WEBSITE_TEMPLATE_SOURCE=/absolute/path/to/next-app npm run template:zip
```

`WEBSITE_TEMPLATE_SOURCE` must point at the canonical Next.js app tree (e.g. your `website-dev` checkout). [`build-template-zip.mjs`](build-template-zip.mjs) copies that app **and** embeds [`closeby/`](../closeby) as `website-dev/closeby` so the bundle is self-contained (Vercel only uploads `website-dev`; monorepo paths outside that folder are not deployed).

Then run (workspace is **removed** after a successful run unless you pass `--keep-workspace`):

```bash
npm run onboard:client -- --dry-run
```

To keep `scripting/website/workspace/<runId>/` for debugging:

```bash
npm run onboard:client -- --dry-run --keep-workspace
```

Omit `--skip-deploy` when you want a deploy; add `--prod` on the onboard command to pass `--prod` through to `vercel deploy` when using **legacy CLI upload** (see below). Use `--client-id=<uuid>` to load **public** Cal fields from Supabase instead of the mock bundle (requires service-role env in `.env.local`).

Use `VERCEL_TOKEN` in `.env.local` for non-interactive deploy ([`run-template-pipeline.mjs`](run-template-pipeline.mjs)).

## Deploy to Vercel

### Default: Git-linked deploy (GitHub private repo + Vercel API)

When **`GITHUB_TOKEN`** and **`GITHUB_OWNER`** are set in `.env.local` (and you do **not** force legacy mode), the pipeline runs after a successful `npm run build`:

1. **GitHub** — Creates a **private** repository `GITHUB_OWNER/<sanitized-slug>` (slug from merged `ClientConfig.slug`, same rules as [`vercel-project-name.mjs`](vercel-project-name.mjs)).
2. **Git** — `git init`, ensures `.gitignore`, initial commit, **`git push`** to `main` (or `GITHUB_DEFAULT_BRANCH`). Requires **`git`** on `PATH`.
3. **Vercel** — **`POST /v11/projects`** with `gitRepository: { type: "github", repo: "owner/repo" }`, scoped with **`VERCEL_ORG_ID`**. The team must have the **GitHub integration** connected once (Vercel dashboard → Team → **Git**).

Also set **`VERCEL_TOKEN`** and **`VERCEL_ORG_ID`**. The first deployment URL is taken from the API response when possible, otherwise polled from **`/v6/deployments`**.

4. **Env + redeploy** — The pipeline **`POST`s** the same secrets you keep in this repo’s **`.env.local`** onto the **new** Vercel project (Cal, Resend, Redis/KV, QStash, etc. — see [`vercel-apply-client-env.mjs`](vercel-apply-client-env.mjs)). It sets **`CLIENT_SLUG`** from the merged client slug and **`NEXT_PUBLIC_SITE_URL`** from the deployment URL when known. Then it triggers a **Git redeploy** so the next build sees those variables (Vercel applies env to the following deployment).

   **Parity with [closeby-demo-project](https://vercel.com/thegoose99s-projects/closeby-demo-project):** Dashboard **Marketplace** integrations (e.g. Upstash Redis / QStash) attach resources and often expose **`KV_REST_*`** or **`UPSTASH_*`** / **`QSTASH_*`** in project settings. The REST API does not replicate clicking “Install integration” on each new project; instead, keep the **same variable names and values** as your demo app in **this** repo’s `.env.local` (or run `vercel env pull .env.local --environment=production` from the demo project once, then paste into `.env.local` here). Optional: **`VERCEL_SYNC_EXTRA_KEYS=FOO,BAR`** for one-off keys; **`VERCEL_SKIP_ENV_SYNC`** / **`VERCEL_SKIP_REDEPLOY`** to skip steps.

**Changing the site later:** clone the repo, commit, push to the default branch — Vercel builds from Git (no need to re-run the onboarding zip for routine edits).

**If the repo already exists:** set **`GITHUB_REPO_EXISTS=reuse`** so creation errors are ignored and the script only pushes (useful for an empty repo you created manually, or after resolving conflicts).

**Duplicate repo without reuse:** creation fails with a clear message; use `GITHUB_REPO_EXISTS=reuse` or delete/rename the repo on GitHub.

### Legacy: `vercel deploy` file upload

To skip GitHub and use the previous **`npx vercel deploy`** behavior (uploads the app folder without a Git remote):

- Set **`VERCEL_USE_CLI_UPLOAD=1`** in `.env.local`, **or**
- Pass **`--vercel-cli-upload`** to **`onboard-client`** or **`run-template-pipeline`**.

Then use **`VERCEL_TOKEN`** + **`VERCEL_ORG_ID`** as before. **`--prod`** on onboard applies to this path only.

### If Git is not configured but `VERCEL_TOKEN` is set

If **`GITHUB_TOKEN`** / **`GITHUB_OWNER`** are missing and you are **not** using legacy mode, the pipeline **exits with an error** explaining that you must either configure Git-linked variables or set **`VERCEL_USE_CLI_UPLOAD=1`** / **`--vercel-cli-upload`**.

### Environment variables (summary)

See [`.env.local.example`](../../.env.local.example) for full comments. Relevant to website deploy:

| Variable | Role |
|----------|------|
| `VERCEL_TOKEN` | Vercel API + CLI |
| `VERCEL_ORG_ID` | Team scope (slug or `team_…` id) |
| `GITHUB_TOKEN` | Create private repo + HTTPS push |
| `GITHUB_OWNER` | User or org owning `GITHUB_OWNER/<slug>` |
| `GITHUB_REPO_EXISTS` | Set to `reuse` to continue when the repo exists |
| `VERCEL_USE_CLI_UPLOAD` | `1` to force legacy CLI upload |
| `CAL_*`, `RESEND_*`, `KV_*`, `UPSTASH_*`, `QSTASH_*` | Synced to the new Vercel project when set in `.env.local` |
| `VERCEL_SYNC_EXTRA_KEYS` | Comma-separated extra keys to sync |
| `VERCEL_SKIP_ENV_SYNC` / `VERCEL_SKIP_REDEPLOY` | Skip env POST or git redeploy |

### One-time operator setup

- **Vercel ↔ GitHub:** In the Vercel team, connect GitHub and grant access to repos under the account/org that will own client sites (same as “Import Git Repository” in the UI).
- **GitHub token:** Classic PAT with **`repo`**, or a fine-grained token with repository creation + contents write for the target owner.

### Org deploy checklist (CloseBy)

- **GitHub**:
  - Set `GITHUB_OWNER=CloseBy`.
  - Ensure `GITHUB_TOKEN` can create **private** repos in the CloseBy org (org policy + token scopes).
  - If the repo name already exists, set `GITHUB_REPO_EXISTS=reuse` to skip creation and only push.
- **Vercel**:
  - Set `VERCEL_ORG_ID` (team id `team_...` or team slug).
  - Connect GitHub integration for the Vercel team and grant access to repos under CloseBy.
- **Env sync policy**:
  - Only “client-site runtime” keys are pushed by default (Cal/Resend/Redis/QStash + `CLIENT_SLUG` + `NEXT_PUBLIC_SITE_URL`).
  - Add any extra keys explicitly via `VERCEL_SYNC_EXTRA_KEYS`.

---

## End-to-end: template zip → onboard

1. **Template zip** — Build once (or when the Next app changes):

   ```bash
   WEBSITE_TEMPLATE_SOURCE=/absolute/path/to/website-dev npm run template:zip
   ```

   Confirms `scripting/website/templates/website-app-template.zip` exists (path is gitignored).

2. **Environment** — In repo root `.env.local` (see [`.env.local.example`](../../.env.local.example)):

   - For **Git-linked deploy:** `GITHUB_TOKEN`, `GITHUB_OWNER`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, plus **client-site secrets** you want on every new project (`CAL_API_KEY`, `CAL_WEBHOOK_SECRET`, `RESEND_API_KEY`, `KV_REST_*` / Upstash, `QSTASH_*`, …) to mirror your reference Vercel project.
   - For **legacy CLI:** `VERCEL_TOKEN`, `VERCEL_ORG_ID` (and optionally `VERCEL_PROJECT_ID` if you pin a project).

3. **Run onboarding with deploy** — From repo root:

   ```bash
   npm run onboard:client -- --dry-run
   ```

   Omit `--skip-deploy` (default). `--dry-run` uses the LLM fixture and avoids Anthropic cost; generation still produces `merged-client.json` and the pipeline runs `npm ci`, `next build`, then **private GitHub repo + Vercel Git-linked project** or **legacy `vercel deploy`** depending on env.

   To persist the deployment URL on a Supabase client row (`clients.website_deploy_url`), pass `--client-id=<uuid>` (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

   - **Production (legacy CLI only):** add `--prod` on the onboard command.
   - **Real Claude generation:** omit `--dry-run` and set `ANTHROPIC_API_KEY`.

4. **Result** — The pipeline logs a deployment URL when resolved. Use `--keep-workspace` to leave `workspace/<runId>/website-dev` and merged JSON under `workspace/onboarding/<runId>/` for debugging.

If the log shows `VERCEL_TOKEN not set — skipping deploy`, add `VERCEL_TOKEN` (and for Git flow, `GITHUB_*` + `VERCEL_ORG_ID`) to repo-root `.env.local` and run onboard again — [`onboard-client.mjs`](../onboard-client.mjs) loads `.env.local` automatically.
