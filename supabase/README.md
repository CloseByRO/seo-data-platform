## Supabase (DB schema + policies)

This project uses Supabase Postgres with a **dedupe-first** schema and **tenant isolation** (RLS-ready).

### Where to run migrations (important)

All versioned SQL lives under **`seo-data-platform/supabase/`** in this repository. Apply and evolve the schema **from this repo’s root** (or using the Supabase CLI with this directory as the linked project), for example:

```bash
cd /path/to/seo-data-platform
supabase link --project-ref <your-project-ref>
supabase db push
```

If the repo has no `supabase/config.toml` yet, run `supabase init` once in this directory (merge with existing `migrations/`), then `supabase link` and `db push`.

**Without the CLI:** apply every file under `supabase/migrations/` in **numeric order** (0001 → … → 0008).

Recommended (uses Node + `pg`; **no `psql` install needed**):

1. Supabase Dashboard → **Project Settings** → **Database** → copy **Connection string** → **URI** (use your real password and project ref — the host looks like `db.abcdefghijklmnop.supabase.co`, not `db.YOUR_REF`).
2. Run:

```bash
cd /path/to/seo-data-platform
npm install
npm run db:apply-migrations -- "postgresql://postgres:<REPLACE_DB_PASSWORD>@db.<REPLACE_PROJECT_REF>.supabase.co:5432/postgres"
```

Paste your actual URI in place of the template; do not leave `YOUR_REF` or `YOUR_PASSWORD` in the string.

**Incremental apply** (only migrations from `0008` onward, after an initial full run):

```bash
npm run db:apply-migrations -- "--from=0008" "postgresql://postgres:…@db….supabase.co:5432/postgres"
```

Optional if you already have the PostgreSQL client: `supabase/apply-migrations-in-order.sh` (calls `psql`).

The **closeby-demo-project** marketing site reads `public.clients` / `public.client_cal_secrets` via the service role but **does not** ship or run its own Supabase migrations; it must target the database you maintain here.

### Apply migrations

For v0.1 (no Supabase CLI required), run the SQL in:

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls_helpers_security_definer.sql`
- `supabase/migrations/0003_job_runs_add_skipped_status.sql`
- …through **`0008_client_cal_secrets_api_hardening.sql`** (includes `0006_client_cal_supabase.sql`: Cal columns + `client_cal_secrets`; `0007_client_website_deploy_url.sql`: `clients.website_deploy_url`; **`0008`**: revoke `anon`/`authenticated` on `client_cal_secrets`, grant `service_role`, index on `updated_at`)

Apply it in the Supabase Dashboard:

- **SQL Editor** → paste each file’s contents **in order** → Run (or use the shell helper above)

If you run into `"Could not find the table 'public.organizations' in the schema cache"` from the API right after applying SQL:

- In Supabase Dashboard, go to **Settings → API → Reload schema** (or wait briefly for PostgREST schema cache to refresh)

After adding new columns (e.g. migration `0006`), reload the schema the same way if PostgREST omits them briefly.

### Migration `0008` (API privileges)

`0008_client_cal_secrets_api_hardening.sql` revokes default PostgREST table privileges on `public.client_cal_secrets` for `anon` and `authenticated`, and grants DML to **`service_role`** only (RLS from `0006` still applies where relevant). Apply after `0006` so the table exists.

### Cal.com (migration `0006`)

**Public fields** live on `public.clients`:

- `cal_com_username` — Cal.com username for embeds (non-secret).
- `cal_com_canonical_event_slugs` — JSON object with keys `initial`, `session`, `couple` (automation / canonical slugs).
- `cal_com_event_slugs` — JSON object with the same three keys (bookable event slugs). Website generation maps these to `services[].calEventSlug` for ids `s0`–`s2` when present.

**Secrets** live in `public.client_cal_secrets` (`cal_api_key`, `cal_webhook_secret`). That table has **RLS enabled and no policies**, so only the **service role** (or Postgres superuser) can read or write it. **Never** copy these into `merged-client.json` or static exports; use them only in server routes (webhooks, Cal API).

Example: set public Cal fields for one client (replace the UUID):

```sql
update public.clients
set
  cal_com_username = 'your-cal-username',
  cal_com_canonical_event_slugs = '{"initial":"consultatie-initiala","session":"sedinta-individuala","couple":"terapie-cuplu"}'::jsonb,
  cal_com_event_slugs = '{"initial":"15min","session":"30min","couple":"30min"}'::jsonb
where id = '00000000-0000-0000-0000-000000000000';
```

Store `cal_api_key` and `cal_webhook_secret` only in `client_cal_secrets` via trusted server code or SQL executed with privileges that respect your security model; never paste them into `.env` as per-client values or into static site bundles.

**Website onboarding** loads public Cal into the merged JSON when you pass `--client-id=<uuid>` to `run-with-toon` / `onboard:client` (requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`). Without `--client-id`, the pipeline uses the mock Cal bundle instead.

**Test client (fixed id):** `lib/website/cal-seed-client-id.ts` exports `CAL_SEED_CLIENT_ID` (`1f2865c5-6bec-41fc-9980-a229e5aba473`). Run `supabase/seeds/test_client_cal.sql` once that row exists to set public Cal columns to the same values as the mock bundle; `tests/merge-client-cal.test.mjs` asserts the row matches `tests/fixtures/test-client-cal-expected.json`.

### Notes

- RLS policies are included but ingestion is expected to run server-side with the **Service Role** key (bypasses RLS).
- Do not store secrets in plaintext in DB. OAuth refresh tokens are stored **encrypted** (app-level encryption).

### Quick smoke test (service role)

If your `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, you can run:

```bash
node --env-file=.env.local --test tests/idempotency.test.js tests/merge-client-cal.test.mjs
```

