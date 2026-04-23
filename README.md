# SEO Data Platform

Internal **Local SEO** data platform: **GSC** + **Google Business Profile** + **SERP grid** (DataForSEO), with **org-scoped** data in **Supabase Postgres**, dedupe-first UPSERTs, and a minimal ops UI.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase** (Auth + Postgres + RLS)
- **Google OAuth** (offline refresh tokens, encrypted at rest)
- **DataForSEO** (Maps / local grid)
- **Cal.com** (booking) + **Meta WhatsApp Cloud API** (no-reply booking updates)

## Local setup

1. **Install**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.local.example` → `.env.local` and fill values (never commit `.env.local`).

3. **Database**

   Apply the schema in the Supabase SQL editor (in order):

   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   - Then `0002` → latest (see `supabase/migrations/`).

   **Migration 0005** adds a unique index on `clients(org_id)` (one client per organization). Apply it only when there are **no duplicate `org_id` rows** in `clients`; dedupe first or the migration will fail.

   See [`supabase/README.md`](supabase/README.md) for notes on RLS and the service role.

4. **Run**

   ```bash
   npm run dev
   ```

   Open `/login`, then `/app` → create an org (optional) → onboard a client → open the dashboard and run ingestion when APIs are configured.

## Internal onboarding (psychologist cabinets)

This repo now includes an **internal (team-only) onboarding intake** for psychologist cabinets. It is **debug-only** today:

- **Form**: `/clients/new?org_id=<uuid>` (multi-step, Google Places address, services w/ duration + price, specialties, working hours, Cal.com + GBP, website options, media uploads w/ client-side resizing).
- **Server validation**: `POST /api/onboarding/intake/validate` (RBAC + masked secrets).
- **Operator tools**: `/app/tools` (copy/paste commands, ingestion runner placeholders, payload validation).

### Operator UX rules

- Prefer **derived defaults** from existing inputs (location/services/specialties/Cal username).
- Keep manual overrides behind **“Operator advanced”** where possible.

## Deploy (Vercel)

- Production app: **https://seo-data-platform.vercel.app**
- Set the same variables as in `.env.local.example` in **Project → Settings → Environment Variables** (Production).  
  **Preview**-scoped env vars require a **connected Git repository** on Vercel.

## Scripts

| Command        | Purpose        |
| -------------- | -------------- |
| `npm run dev`  | Dev server     |
| `npm run build`| Production build |
| `npm run start`| Start production server |
| `npm run lint` | ESLint         |
| `npm test`     | Node test runner (`tests/`) |

## Local Tools debugging (script runs)

The internal Tools UI can start predefined server-side script runs and stream logs live (saved in MongoDB). For local use:

- **Env vars**:
  - `MONGODB_URI` (MongoDB Atlas connection string)
  - `MONGODB_DB` (default: `seo_data_platform`)
  - `NEXT_PUBLIC_ENABLE_TOOLS_RUN=1`
- **Run**:

```bash
npm run dev
```

- **UI**: open `/app/tools` → “Script runs (live logs)”
- **CLI helper**:

```bash
./node_modules/.bin/tsx scripting/tools/dev-runner.ts --org-id=<uuid> --script-id=keyword_intel_smoke
```

## Next step: intake → pipeline

The intended next stage is to turn the final debug payload into a real onboarding pipeline:

- **Supabase persistence**: store the intake payload + processing state (and create/update `clients`, `locations`, `org_integrations`).
- **DataForSEO**:
  - **Maps SERP**: classify candidate keywords by local-pack presence (grid vs landing/content).
  - **Metrics (optional, plan-dependent)**: Clickstream and/or Google Ads keyword metrics for volume/CPC/competition.
  - **Labs competitor expansion (optional, plan-dependent)**: expand from ranked competitors and re-enrich.
- **Claude API**: generate site copy (RO/RO+EN) + structured content blocks.
- **Website provisioning**: generate config, create/update GitHub repo, deploy on Vercel, persist `clients.website_deploy_url`.

## Development status (Phase 1)

**Done in code**

- Supabase schema + RLS + `job_runs`, `google_connections`, `org_integrations`
- Supabase SSR helpers + `proxy.ts` session refresh
- Google OAuth connect (`/api/auth/google/*`)
- Ingestion jobs: GSC daily, GBP daily, SERP grid (DataForSEO), default **last 3 days**, UPSERT + job run rows
- UI: login, org list/create, client onboarding, dashboard (heatmap + trend snippets + job runs + “Run ingest”)

**You still configure per tenant / Google**

- `org_integrations.gsc_site_url` (GSC property URL)
- `locations.gbp_location_id` for GBP Performance API
- Google Cloud: APIs enabled, OAuth client, redirect URI  
  `https://seo-data-platform.vercel.app/api/auth/google/callback` (or your custom domain)

**Known follow-ups**

- Consider migrating the session refresh logic from `proxy.ts` into route-level auth checks as the app matures (Proxy should be a last resort).
- SERP parsing assumes DataForSEO Maps payload shape; adjust if your account returns different `items` types.

## Agent notes

See [`AGENTS.md`](AGENTS.md) for Next.js version caveats in this repo.
