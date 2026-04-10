## Supabase (DB schema + policies)

This project uses Supabase Postgres with a **dedupe-first** schema and **tenant isolation** (RLS-ready).

### Apply migrations

For v0.1 (no Supabase CLI required), run the SQL in:

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls_helpers_security_definer.sql`

Apply it in the Supabase Dashboard:

- **SQL Editor** → paste contents → Run

If you run into `"Could not find the table 'public.organizations' in the schema cache"` from the API right after applying SQL:

- In Supabase Dashboard, go to **Settings → API → Reload schema** (or wait briefly for PostgREST schema cache to refresh)

### Notes

- RLS policies are included but ingestion is expected to run server-side with the **Service Role** key (bypasses RLS).
- Do not store secrets in plaintext in DB. OAuth refresh tokens are stored **encrypted** (app-level encryption).

### Quick smoke test (service role)

If your `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, you can run:

```bash
node --env-file=.env.local --test tests/idempotency.test.js
```

