import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'

export default async function ToolsCollectionPage(props: {
  params: Promise<{ collection: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) redirect('/app')
  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) redirect('/access-denied')

  const { collection } = await props.params
  const sp = await props.searchParams
  const skip = typeof sp.skip === 'string' ? Number(sp.skip) : 0
  const limit = typeof sp.limit === 'string' ? Number(sp.limit) : 25

  const qs = new URLSearchParams({ skip: String(Number.isFinite(skip) ? skip : 0), limit: String(Number.isFinite(limit) ? limit : 25) })

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Collection</h1>
          <p className="mt-2 text-sm text-slate-400 font-mono">{collection}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/tools/data"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
          >
            Collections
          </Link>
          <Link href="/app/tools" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900">
            Tools
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="text-xs text-slate-500">
          API:{' '}
          <code className="rounded bg-slate-950 px-1 py-0.5">
            /api/tools/collections/{collection}?{qs.toString()}
          </code>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Link
          href={`/app/tools/data/${collection}?skip=${Math.max(0, skip - limit)}&limit=${limit}`}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
        >
          Prev
        </Link>
        <Link
          href={`/app/tools/data/${collection}?skip=${skip + limit}&limit=${limit}`}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
        >
          Next
        </Link>
        <span className="text-xs text-slate-500">
          skip={skip} limit={limit}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
        <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
          This view is intentionally minimal for now (raw JSON rows, formatted for display). We'll add field-aware formatting over time.
        </div>
        <div className="max-h-[640px] overflow-auto p-4">
          <pre className="text-xs text-slate-200">{`Open the API URL above in a new tab to see rows.\n(Next iteration: render table from server-fetched rows.)`}</pre>
        </div>
      </div>
    </div>
  )
}

