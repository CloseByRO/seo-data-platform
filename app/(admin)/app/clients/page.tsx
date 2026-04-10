import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'
import { AdminClientsView } from '@/components/admin/admin-clients-view'

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v ?? '')
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export default async function AdminClientsPage(props: {
  searchParams: Promise<{ page?: string; sort?: string; selected?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) {
    return (
      <div className="px-6 py-10 text-slate-300 md:px-10">
        <p className="max-w-lg text-sm text-slate-400">
          No platform operator organization is configured. Create an organization with{' '}
          <code className="rounded bg-slate-900 px-1 py-0.5 text-slate-300">is_platform_operator = true</code> in the
          database.
        </p>
      </div>
    )
  }

  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) {
    redirect('/access-denied')
  }

  const page = clampInt(searchParams.page ?? null, 1, 1, 10_000)
  const pageSize = 15
  const sort = (searchParams.sort ?? 'updated').toLowerCase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const selectedId = searchParams.selected?.trim() || null

  let q = supabase
    .from('clients')
    .select('id,display_name,client_slug,primary_domain,created_at,updated_at', { count: 'exact' })
    .eq('org_id', operatorOrgId)

  if (sort === 'name') {
    q = q.order('display_name', { ascending: true })
  } else {
    q = q.order('updated_at', { ascending: false })
  }

  const { data: clients, count } = await q.range(from, to)
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const clientIds = (clients ?? []).map((c) => c.id)
  const primaryGbpByClient = new Map<string, string | null>()
  if (clientIds.length > 0) {
    const { data: locRows } = await supabase
      .from('locations')
      .select('client_id,gbp_location_id,created_at')
      .eq('org_id', operatorOrgId)
      .in('client_id', clientIds)
      .order('created_at', { ascending: true })
    for (const row of locRows ?? []) {
      if (!primaryGbpByClient.has(row.client_id)) {
        primaryGbpByClient.set(row.client_id, row.gbp_location_id)
      }
    }
  }

  const lastSerpByClient = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: serpJobs } = await supabase
      .from('job_runs')
      .select('params,finished_at,status')
      .eq('org_id', operatorOrgId)
      .eq('job_name', 'ingest_serp_grid')
      .eq('status', 'success')
      .order('finished_at', { ascending: false, nullsFirst: false })
      .limit(1000)
    const seen = new Set<string>()
    for (const j of serpJobs ?? []) {
      if (!j.finished_at) continue
      const cid = (j.params as { clientId?: string })?.clientId
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      lastSerpByClient.set(cid, j.finished_at)
    }
  }

  const clientsForView = (clients ?? []).map((c) => ({
    ...c,
    gbp_location_id: primaryGbpByClient.get(c.id) ?? null,
    last_serp_sync_at: lastSerpByClient.get(c.id) ?? null,
  }))

  let detail: {
    client: {
      id: string
      org_id: string
      display_name: string
      client_slug: string
      primary_domain: string | null
      created_at: string
      updated_at: string
    }
    locations: Array<{
      id: string
      address_text: string
      lat: number | null
      lng: number | null
      place_id: string | null
      gbp_location_id: string | null
      created_at: string
    }>
    keywords: Array<{ id: string; keyword_raw: string; created_at: string }>
    canEdit: boolean
    canDelete: boolean
  } | null = null
  let mapsEmbedUrl: string | null = null
  let analyticsHref: string | null = null
  let keywordsHref: string | null = null

  if (selectedId) {
    const { data: c } = await supabase
      .from('clients')
      .select('id,org_id,display_name,client_slug,primary_domain,created_at,updated_at')
      .eq('id', selectedId)
      .eq('org_id', operatorOrgId)
      .maybeSingle()

    if (c) {
      const { data: locations } = await supabase
        .from('locations')
        .select('id,address_text,lat,lng,place_id,gbp_location_id,created_at')
        .eq('client_id', c.id)
        .eq('org_id', operatorOrgId)
        .order('created_at', { ascending: false })

      const { data: keywords } = await supabase
        .from('keywords')
        .select('id,keyword_raw,created_at')
        .eq('client_id', c.id)
        .eq('org_id', operatorOrgId)
        .order('created_at', { ascending: true })

      const canEdit = await canMutateOrgData(supabase, operatorOrgId, user.id)
      const canDelete = canEdit

      const primary = locations?.[0] ?? null
      const mapKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (mapKey && primary?.lat != null && primary?.lng != null) {
        mapsEmbedUrl = `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(mapKey)}&center=${primary.lat},${primary.lng}&zoom=14`
      }

      const kwFirst = keywords?.[0]
      const loc = primary
      analyticsHref =
        loc && kwFirst
          ? `/dashboard/${c.id}/${loc.id}?org_id=${encodeURIComponent(operatorOrgId)}&keyword_id=${encodeURIComponent(kwFirst.id)}`
          : loc
            ? `/dashboard/${c.id}/${loc.id}?org_id=${encodeURIComponent(operatorOrgId)}`
            : null

      keywordsHref = `/app/clients/${c.id}/keywords?org_id=${encodeURIComponent(operatorOrgId)}`

      detail = {
        client: c,
        locations: locations ?? [],
        keywords: keywords ?? [],
        canEdit,
        canDelete,
      }
    }
  }

  return (
    <AdminClientsView
      orgId={operatorOrgId}
      clients={clientsForView}
      page={page}
      totalPages={totalPages}
      sort={sort}
      selectedId={selectedId}
      detail={detail}
      mapsEmbedUrl={mapsEmbedUrl}
      analyticsHref={analyticsHref}
      keywordsHref={keywordsHref}
    />
  )
}
