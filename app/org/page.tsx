import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData, isPlatformOperatorAdmin } from '@/lib/rbac/server'
import { CreateOrgForm } from '@/components/org/create-org-form'
import { InfoTooltip } from '@/components/ui/info-tooltip'

/** Supabase nested `organizations(name)` may be typed as object or single-element array. */
function organizationLabel(orgId: string, organizations: unknown): string {
  if (organizations == null) return orgId
  if (Array.isArray(organizations)) {
    const first = organizations[0] as { name?: unknown } | undefined
    return typeof first?.name === 'string' ? first.name : orgId
  }
  if (typeof organizations === 'object' && organizations !== null && 'name' in organizations) {
    const n = (organizations as { name: unknown }).name
    return typeof n === 'string' ? n : orgId
  }
  return orgId
}

export default async function OrgPage(props: { searchParams: Promise<{ org_id?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('org_memberships')
    .select('org_id,role,organizations(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const orgId = searchParams.org_id ?? memberships?.[0]?.org_id ?? null

  const canCreateOrg = await isPlatformOperatorAdmin(supabase, user.id)
  const canManageSelectedOrg = orgId ? await canMutateOrgData(supabase, orgId, user.id) : false

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Connect Google, onboard clients, and run ingestion. Admin actions are limited to CloseBy platform
            operators.
          </p>
        </div>
        {canCreateOrg ? (
          <CreateOrgForm />
        ) : (
          <p className="max-w-xs text-xs text-black/50 dark:text-white/50">
            Creating organizations is restricted to CloseBy owner/admin accounts.
          </p>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4">
        {(memberships ?? []).map((m) => (
          <Link
            key={m.org_id}
            href={`/org?org_id=${encodeURIComponent(m.org_id)}`}
            className={`rounded-xl border p-4 transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 ${
              m.org_id === orgId
                ? 'border-black/30 bg-black/[.03] dark:border-white/30 dark:bg-white/10'
                : 'border-black/10 hover:bg-black/[.02] dark:border-white/15 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="font-medium">{organizationLabel(m.org_id, m.organizations)}</div>
              <div className="text-xs text-black/60 dark:text-white/60">{m.role}</div>
            </div>
          </Link>
        ))}
      </div>

      {orgId ? (
        <div className="mt-10 rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-lg font-semibold">Org actions</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Integrations (Google OAuth, GSC/GBP tokens) are stored per organization and shared with every member who
            can access this org. Only CloseBy platform admins can change them.
            <InfoTooltip text="OAuth tokens and org integration settings apply to the whole workspace. Anyone in this org with dashboard access sees data ingested with those credentials. Mutations are reserved for CloseBy operators." />
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/15 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
              href={`/clients?org_id=${encodeURIComponent(orgId)}`}
            >
              View clients
            </Link>
            {canManageSelectedOrg ? (
              <span className="inline-flex items-center gap-1">
                <a
                  className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30"
                  href={`/api/auth/google/start?org_id=${encodeURIComponent(orgId)}`}
                >
                  Connect Google (GSC + GBP)
                </a>
                <InfoTooltip text="Connects Google Search Console and Business Profile for this organization. Tokens are stored encrypted per org and used by ingestion jobs for every client under this org." />
              </span>
            ) : (
              <span className="rounded-md border border-black/10 px-3 py-2 text-sm text-black/40 dark:border-white/15 dark:text-white/40">
                Connect Google (CloseBy admins only)
              </span>
            )}
            {canManageSelectedOrg ? (
              <span className="inline-flex items-center gap-1">
                <Link
                  className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/15 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
                  href={`/clients/new?org_id=${encodeURIComponent(orgId)}`}
                >
                  Onboard client
                </Link>
                <InfoTooltip text="Creates clients, locations, and keywords under this org. Visible to all org members after creation; editing is limited to CloseBy platform admins." />
              </span>
            ) : (
              <span className="rounded-md border border-black/10 px-3 py-2 text-sm text-black/40 dark:border-white/15 dark:text-white/40">
                Onboard client (CloseBy admins only)
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
