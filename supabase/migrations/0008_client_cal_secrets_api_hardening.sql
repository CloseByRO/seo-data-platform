-- PostgREST hardening for `client_cal_secrets` (CloseBy demo + server-side Cal API).
-- 0006 enables RLS with no policies (deny for anon/authenticated). Supabase still grants table
-- privileges to API roles by default; revoke so only service_role / Postgres superuser can touch rows.

revoke all on table public.client_cal_secrets from anon, authenticated;

grant select, insert, update, delete on table public.client_cal_secrets to service_role;

-- Operational index (recency ordering for audits / tooling).
create index if not exists client_cal_secrets_updated_at_idx
  on public.client_cal_secrets (updated_at desc);
