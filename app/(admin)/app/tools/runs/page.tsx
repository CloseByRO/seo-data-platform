import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'

export default async function ToolsRunsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) redirect('/app')

  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) redirect('/access-denied')

  const sp = await props.searchParams
  const kind = (typeof sp.kind === 'string' && sp.kind === 'real') ? 'real' : 'dry'

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Script runs</h1>
          <p className="mt-2 text-sm text-slate-400">Recent runs saved in MongoDB. Click a run to open live logs.</p>
        </div>
        <Link
          href="/app/tools"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
        >
          Back to Tools
        </Link>
      </div>

      <div className="mt-6">
        <div className="text-xs text-slate-500">Kind: <span className="text-slate-200">{kind}</span></div>
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-300">
            Open a run detail page:
          </p>
          <p className="mt-2 text-xs text-slate-500">
            The list UI is powered by <code className="rounded bg-slate-950 px-1 py-0.5">/api/tools/runs/list</code>.
          </p>
          <div className="mt-4">
            <Link
              href={`/app/tools/runs?orgId=${operatorOrgId}&kind=${kind}`}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
            >
              Refresh
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <pre className="text-xs text-slate-300">
          {`Tip: use the launcher on /app/tools to create a run.\nThen open: /app/tools/runs/<runId>?kind=${kind}&orgId=${operatorOrgId}`}
        </pre>
      </div>
    </div>
  )
}

