-- Platform operator org (CloseBy): only owner/admin in this org can mutate data and manage integrations.
-- After deploy: mark exactly one org, e.g. UPDATE organizations SET is_platform_operator = true WHERE name = 'CloseBy';

alter table public.organizations
  add column if not exists is_platform_operator boolean not null default false;

-- At most one operator org (partial unique index).
create unique index if not exists organizations_one_platform_operator
  on public.organizations (is_platform_operator)
  where is_platform_operator = true;

comment on column public.organizations.is_platform_operator is
  'When true, this org is the CloseBy / platform operator tenant. Only owner/admin members of this org receive write/admin capabilities across the app.';
