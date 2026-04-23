-- Extend onboarding_intakes for durable retries + derived artifacts.
-- Keep backwards-compatible with existing status values.

alter table public.onboarding_intakes
  add column if not exists attempts int not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists artifacts jsonb not null default '{}'::jsonb;

comment on column public.onboarding_intakes.attempts is 'Number of pipeline attempts (for retries/backoff).';
comment on column public.onboarding_intakes.next_retry_at is 'Earliest time the pipeline should retry processing.';
comment on column public.onboarding_intakes.artifacts is 'Derived outputs (keyword intel, website config artifact, claude content, audit timestamps).';

create index if not exists onboarding_intakes_next_retry_at_idx
  on public.onboarding_intakes (next_retry_at);

