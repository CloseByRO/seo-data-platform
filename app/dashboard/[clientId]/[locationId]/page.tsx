import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { RunIngestButton } from '@/components/dashboard/run-ingest-button'
import { KeywordSelect } from '@/components/dashboard/keyword-select'

function startOfDayIso(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export default async function DashboardPage(props: {
  params: Promise<{ clientId: string; locationId: string }>
  searchParams: Promise<{ keyword_id?: string; org_id?: string }>
}) {
  const { clientId, locationId } = await props.params
  const searchParams = await props.searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase
    .from('clients')
    .select('id,org_id,display_name,client_slug')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) redirect('/org')

  const canRunIngest = await canMutateOrgData(supabase, client.org_id, user.id)

  const { data: location } = await supabase
    .from('locations')
    .select('id,address_text,lat,lng')
    .eq('id', locationId)
    .maybeSingle()
  if (!location) redirect('/org')

  const { data: keywordsRaw } = await supabase
    .from('keywords')
    .select('id,keyword_raw')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  type KeywordRow = { id: string; keyword_raw: string }
  const keywords: KeywordRow[] = (keywordsRaw ?? []) as KeywordRow[]

  const keywordId = searchParams.keyword_id ?? keywords[0]?.id ?? null

  let serpDate: string | null = null
  if (keywordId) {
    const { data: latest } = await supabase
      .from('serp_grid_observations')
      .select('observed_date')
      .eq('keyword_id', keywordId)
      .order('observed_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    serpDate = latest?.observed_date ?? null
  }

  type ObservationRow = {
    rank: number | null
    grid_points: { point_index: number } | null
  }

  const observations: ObservationRow[] =
    keywordId && serpDate
      ? ((await supabase
          .from('serp_grid_observations')
          .select('rank,grid_points(point_index)')
          .eq('keyword_id', keywordId)
          .eq('observed_date', serpDate)).data as ObservationRow[] | null) ?? []
      : []

  const ranksByIndex = new Map<number, number | null>()
  for (const o of observations) {
    const idx = o.grid_points?.point_index
    if (typeof idx === 'number') ranksByIndex.set(idx, o.rank ?? null)
  }

  const gbpStart = startOfDayIso(29)
  const { data: gbpMetrics } = await supabase
    .from('gbp_daily_metrics')
    .select('metric_date,calls,directions,website_clicks,views,searches')
    .eq('location_id', locationId)
    .gte('metric_date', gbpStart)
    .order('metric_date', { ascending: true })

  const { data: gscRows } = await supabase
    .from('gsc_search_analytics_daily')
    .select('metric_date,clicks,impressions')
    .eq('client_id', clientId)
    .gte('metric_date', gbpStart)

  type GscRow = { metric_date: string; clicks: number; impressions: number }

  const gscByDate = new Map<string, { clicks: number; impressions: number }>()
  for (const r of (gscRows ?? []) as GscRow[]) {
    const day = r.metric_date
    const cur = gscByDate.get(day) ?? { clicks: 0, impressions: 0 }
    cur.clicks += r.clicks ?? 0
    cur.impressions += r.impressions ?? 0
    gscByDate.set(day, cur)
  }

  const { data: jobRuns } = await supabase
    .from('job_runs')
    .select('job_name,status,started_at,finished_at,error')
    .eq('org_id', client.org_id)
    .order('started_at', { ascending: false })
    .limit(20)

  const size = 5

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Link href={`/org?org_id=${encodeURIComponent(client.org_id)}`} className="text-sm underline underline-offset-4">
            Back to org
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{client.display_name}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">{location.address_text}</p>
          <div className="mt-4">
            <RunIngestButton
              orgId={client.org_id}
              clientId={client.id}
              locationId={location.id}
              canRun={canRunIngest}
            />
          </div>
        </div>

        <div className="min-w-[260px] rounded-2xl border border-black/10 p-4 dark:border-white/15">
          <div className="text-sm font-medium">Keyword</div>
          <div className="mt-2">
            {keywordId ? (
              <KeywordSelect
                clientId={clientId}
                locationId={locationId}
                orgId={client.org_id}
                keywordId={keywordId}
                keywords={keywords}
              />
            ) : (
              <div className="text-sm text-black/60 dark:text-white/60">No keywords yet.</div>
            )}
          </div>
          <div className="mt-3 text-xs text-black/60 dark:text-white/60">
            Heatmap date: {serpDate ?? '—'}
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-lg font-semibold">Grid heatmap (5×5)</h2>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">Lower rank is better. Empty means not found.</p>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {Array.from({ length: size * size }).map((_, i) => {
              const r = ranksByIndex.get(i) ?? null
              const good = r !== null && r <= 3
              const mid = r !== null && r > 3 && r <= 10
              const cls = good
                ? 'bg-emerald-500/20 border-emerald-500/30'
                : mid
                  ? 'bg-amber-500/20 border-amber-500/30'
                  : r !== null
                    ? 'bg-rose-500/15 border-rose-500/25'
                    : 'bg-black/[.03] border-black/10 dark:bg-white/10 dark:border-white/15'
              return (
                <div key={i} className={`aspect-square rounded-lg border flex items-center justify-center ${cls}`}>
                  <span className="text-sm font-medium">{r ?? '—'}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-lg font-semibold">Trends (last 30 days)</h2>

          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="text-sm font-medium">GBP actions</div>
              <div className="mt-2 space-y-1 text-sm text-black/70 dark:text-white/70">
                {(gbpMetrics ?? []).slice(-7).map((d) => (
                  <div key={d.metric_date} className="flex justify-between">
                    <span>{d.metric_date}</span>
                    <span>
                      calls {d.calls ?? 0} · dir {d.directions ?? 0} · web {d.website_clicks ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium">GSC totals</div>
              <div className="mt-2 space-y-1 text-sm text-black/70 dark:text-white/70">
                {Array.from(gscByDate.entries())
                  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
                  .slice(-7)
                  .map(([day, v]) => (
                    <div key={day} className="flex justify-between">
                      <span>{day}</span>
                      <span>
                        clicks {v.clicks} · impr {v.impressions}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-10 rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-semibold">Job runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-black/60 dark:text-white/60">
              <tr>
                <th className="py-2 pr-4">Job</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Finished</th>
                <th className="py-2 pr-4">Error</th>
              </tr>
            </thead>
            <tbody>
              {(jobRuns ?? []).map((r) => (
                <tr key={`${r.job_name}-${r.started_at}`} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-2 pr-4">{r.job_name}</td>
                  <td className="py-2 pr-4">{r.status}</td>
                  <td className="py-2 pr-4">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-2 pr-4">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4">{r.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

