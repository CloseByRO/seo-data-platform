import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? '')
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export default async function ClientsPage(props: {
  searchParams: Promise<{ org_id?: string; page?: string; pageSize?: string; sort?: string }>
}) {
  const searchParams = await props.searchParams
  const orgId = searchParams.org_id
  if (!orgId) redirect('/org')

  const page = clampInt(searchParams.page ?? null, 1, 1, 10_000)
  const pageSize = clampInt(searchParams.pageSize ?? null, 20, 5, 100)
  const sort = (searchParams.sort ?? 'new').toLowerCase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/org')

  const canManage = await canMutateOrgData(supabase, orgId, user.id)

  let q = supabase.from('clients').select('id,display_name,client_slug,created_at,primary_domain', { count: 'exact' }).eq('org_id', orgId)

  if (sort === 'name') {
    q = q.order('display_name', { ascending: true })
  } else {
    q = q.order('created_at', { ascending: false })
  }

  const { data: clients, count } = await q.range(from, to)

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/org?org_id=${encodeURIComponent(orgId)}`} className="text-sm underline underline-offset-4">
            Back to org
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Sorted by {sort === 'name' ? 'business name' : 'latest added'} · {total} total
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <Link
              href={`/clients/new?org_id=${encodeURIComponent(orgId)}`}
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30"
            >
              Onboard client
            </Link>
          ) : null}
          <Link
            href={`/clients?org_id=${encodeURIComponent(orgId)}&sort=${encodeURIComponent(sort === 'name' ? 'new' : 'name')}&page=1&pageSize=${pageSize}`}
            className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/15 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
          >
            Sort: {sort === 'name' ? 'Name' : 'Latest'}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3">
        {(clients ?? []).map((c) => (
          <Link
            key={c.id}
            href={`/clients/${encodeURIComponent(c.id)}?org_id=${encodeURIComponent(orgId)}`}
            className="rounded-xl border border-black/10 p-4 transition-all duration-150 ease-out hover:bg-black/[.02] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/15 dark:hover:bg-white/5 dark:focus-visible:ring-white/20"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{c.display_name}</div>
                <div className="mt-1 text-xs text-black/60 dark:text-white/60">
                  {c.primary_domain ? c.primary_domain : c.client_slug}
                </div>
              </div>
              <div className="text-xs text-black/60 dark:text-white/60">
                Added {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <Link
          aria-disabled={page <= 1}
          className={`rounded-md border border-black/10 px-3 py-2 text-sm ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-black/[.04]'} dark:border-white/15 dark:hover:bg-white/10`}
          href={`/clients?org_id=${encodeURIComponent(orgId)}&sort=${encodeURIComponent(sort)}&page=${Math.max(1, page - 1)}&pageSize=${pageSize}`}
        >
          Prev
        </Link>
        <div className="text-sm text-black/60 dark:text-white/60">
          Page {page} / {totalPages}
        </div>
        <Link
          aria-disabled={page >= totalPages}
          className={`rounded-md border border-black/10 px-3 py-2 text-sm ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-black/[.04]'} dark:border-white/15 dark:hover:bg-white/10`}
          href={`/clients?org_id=${encodeURIComponent(orgId)}&sort=${encodeURIComponent(sort)}&page=${Math.min(totalPages, page + 1)}&pageSize=${pageSize}`}
        >
          Next
        </Link>
      </div>
    </div>
  )
}
