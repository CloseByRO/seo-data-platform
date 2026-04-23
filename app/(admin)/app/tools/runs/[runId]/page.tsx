import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'
import { ToolsRunTerminal } from '@/components/admin/tools-run-terminal'

export default async function ToolsRunPage(props: {
  params: Promise<{ runId: string }>
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

  const { runId } = await props.params
  const sp = await props.searchParams
  const kind = (typeof sp.kind === 'string' && sp.kind === 'real') ? 'real' : 'dry'
  const orgId = (typeof sp.orgId === 'string' && sp.orgId.trim()) ? sp.orgId : operatorOrgId

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Run</h1>
          <p className="mt-2 text-sm text-slate-400">
            <span className="font-mono text-slate-200">{runId}</span> · kind{' '}
            <span className="font-mono text-slate-200">{kind}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/tools/runs?orgId=${orgId}&kind=${kind}`}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
          >
            Runs
          </Link>
          <Link href="/app/tools" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900">
            Tools
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <ToolsRunTerminal runId={runId} orgId={orgId} kind={kind} />
      </div>
    </div>
  )
}

