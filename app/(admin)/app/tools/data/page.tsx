import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'

export default async function ToolsDataPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) redirect('/app')
  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) redirect('/access-denied')

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Data / logs</h1>
          <p className="mt-2 text-sm text-slate-400">Browse MongoDB collections used by Tools runs.</p>
        </div>
        <Link href="/app/tools" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900">
          Back to Tools
        </Link>
      </div>

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="text-sm font-medium text-slate-200">Collections</div>
        <p className="mt-2 text-sm text-slate-500">
          This page is backed by <code className="rounded bg-slate-950 px-1 py-0.5">/api/tools/collections</code>.
        </p>

        <div className="mt-4 space-y-2 text-sm">
          {[
            'tools_runs_dry',
            'tools_runs_real',
            'tools_run_logs_dry',
            'tools_run_logs_real',
          ].map((name) => (
            <Link
              key={name}
              href={`/app/tools/data/${name}`}
              className="block rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-slate-200 hover:bg-slate-900"
            >
              {name}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <pre className="text-xs text-slate-300">{`Tip: open a collection page.\nPagination is via ?skip=0&limit=25.`}</pre>
      </div>
    </div>
  )
}

