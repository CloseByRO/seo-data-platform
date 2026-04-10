-- Fix RLS helper recursion by running membership checks as table owner.
-- Supabase RLS policies call these helpers; without SECURITY DEFINER they can
-- recurse/deny when querying org_memberships under RLS.

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships m
    where m.org_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

