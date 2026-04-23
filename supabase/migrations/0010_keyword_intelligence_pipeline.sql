-- Keyword intelligence pipeline persistence (DataForSEO enrichment + classification).
-- Stores candidate keywords, enrichment metrics, classifications, and run history.
-- This is operator tooling; read allowed to org members, write to org admins.

create table if not exists public.keyword_intel_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid,

  client_id uuid references public.clients(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,

  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),
  error text,

  input_payload jsonb not null,
  output_summary jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keyword_intel_runs_org_created_at_idx
  on public.keyword_intel_runs (org_id, created_at desc);

create index if not exists keyword_intel_runs_client_created_at_idx
  on public.keyword_intel_runs (client_id, created_at desc);

create index if not exists keyword_intel_runs_location_created_at_idx
  on public.keyword_intel_runs (location_id, created_at desc);

comment on table public.keyword_intel_runs is
  'Keyword intelligence pipeline runs (inputs, status, and summary outputs).';

create table if not exists public.keyword_intel_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.keyword_intel_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  keyword text not null,
  keyword_norm text not null,
  variants jsonb,
  sources jsonb,

  geo_tokens text[],
  intent_hints text[],

  created_at timestamptz not null default now()
);

create index if not exists keyword_intel_candidates_run_idx
  on public.keyword_intel_candidates (run_id);

create index if not exists keyword_intel_candidates_norm_idx
  on public.keyword_intel_candidates (org_id, keyword_norm);

comment on table public.keyword_intel_candidates is
  'Generated + normalized keyword candidates (deduped by keyword_norm), with variants and sources.';

create table if not exists public.keyword_intel_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.keyword_intel_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  keyword text not null,
  keyword_norm text not null,

  provider text not null default 'none'
    check (provider in ('clickstream', 'google_ads', 'none')),

  search_volume integer,
  cpc numeric,
  competition numeric,
  monthly jsonb,

  created_at timestamptz not null default now()
);

create index if not exists keyword_intel_metrics_run_idx
  on public.keyword_intel_metrics (run_id);

create index if not exists keyword_intel_metrics_norm_idx
  on public.keyword_intel_metrics (org_id, keyword_norm);

comment on table public.keyword_intel_metrics is
  'Enrichment metrics per keyword candidate (search volume, CPC, competition), cached per run.';

create table if not exists public.keyword_intel_classifications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.keyword_intel_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  keyword text not null,
  keyword_norm text not null,

  class text not null check (class in ('grid', 'landing', 'content')),
  reason jsonb,

  created_at timestamptz not null default now()
);

create index if not exists keyword_intel_classifications_run_idx
  on public.keyword_intel_classifications (run_id);

create index if not exists keyword_intel_classifications_norm_idx
  on public.keyword_intel_classifications (org_id, keyword_norm);

comment on table public.keyword_intel_classifications is
  'Keyword intent classification outputs: grid (local pack), landing (commercial), content (informational).';

create table if not exists public.keyword_intel_competitor_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.keyword_intel_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  seed_query text not null,
  keyword text not null,
  keyword_norm text not null,

  search_volume integer,
  cpc numeric,
  competition numeric,

  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists keyword_intel_competitor_sources_run_idx
  on public.keyword_intel_competitor_sources (run_id);

comment on table public.keyword_intel_competitor_sources is
  'Competitor-derived keywords (via DataForSEO Labs), joined back into candidate pool when available.';

-- RLS
alter table public.keyword_intel_runs enable row level security;
alter table public.keyword_intel_candidates enable row level security;
alter table public.keyword_intel_metrics enable row level security;
alter table public.keyword_intel_classifications enable row level security;
alter table public.keyword_intel_competitor_sources enable row level security;

do $$
begin
  -- keyword_intel_runs
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_runs' and policyname='keyword_intel_runs_select_member'
  ) then
    create policy keyword_intel_runs_select_member
      on public.keyword_intel_runs
      for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_runs' and policyname='keyword_intel_runs_insert_admin'
  ) then
    create policy keyword_intel_runs_insert_admin
      on public.keyword_intel_runs
      for insert
      with check (public.is_org_admin(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_runs' and policyname='keyword_intel_runs_update_admin'
  ) then
    create policy keyword_intel_runs_update_admin
      on public.keyword_intel_runs
      for update
      using (public.is_org_admin(org_id))
      with check (public.is_org_admin(org_id));
  end if;

  -- keyword_intel_candidates
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_candidates' and policyname='keyword_intel_candidates_select_member'
  ) then
    create policy keyword_intel_candidates_select_member
      on public.keyword_intel_candidates
      for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_candidates' and policyname='keyword_intel_candidates_insert_admin'
  ) then
    create policy keyword_intel_candidates_insert_admin
      on public.keyword_intel_candidates
      for insert
      with check (public.is_org_admin(org_id));
  end if;

  -- keyword_intel_metrics
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_metrics' and policyname='keyword_intel_metrics_select_member'
  ) then
    create policy keyword_intel_metrics_select_member
      on public.keyword_intel_metrics
      for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_metrics' and policyname='keyword_intel_metrics_insert_admin'
  ) then
    create policy keyword_intel_metrics_insert_admin
      on public.keyword_intel_metrics
      for insert
      with check (public.is_org_admin(org_id));
  end if;

  -- keyword_intel_classifications
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_classifications' and policyname='keyword_intel_classifications_select_member'
  ) then
    create policy keyword_intel_classifications_select_member
      on public.keyword_intel_classifications
      for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_classifications' and policyname='keyword_intel_classifications_insert_admin'
  ) then
    create policy keyword_intel_classifications_insert_admin
      on public.keyword_intel_classifications
      for insert
      with check (public.is_org_admin(org_id));
  end if;

  -- keyword_intel_competitor_sources
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_competitor_sources' and policyname='keyword_intel_competitor_sources_select_member'
  ) then
    create policy keyword_intel_competitor_sources_select_member
      on public.keyword_intel_competitor_sources
      for select
      using (public.is_org_member(org_id));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='keyword_intel_competitor_sources' and policyname='keyword_intel_competitor_sources_insert_admin'
  ) then
    create policy keyword_intel_competitor_sources_insert_admin
      on public.keyword_intel_competitor_sources
      for insert
      with check (public.is_org_admin(org_id));
  end if;
end $$;

