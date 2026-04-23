import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'
import { ToolsKeywordIntelRunner } from '@/components/admin/tools-keyword-intel-runner'
import { ToolsScriptRunsLauncher } from '@/components/admin/tools-script-runs-launcher'

function Card(props: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-sm font-medium text-slate-200">{props.title}</h2>
      <p className="mt-2 text-sm text-slate-500">{props.desc}</p>
      {props.children ? <div className="mt-4">{props.children}</div> : null}
    </section>
  )
}

function Cmd(props: { children: string }) {
  return (
    <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-emerald-300">
      <code>{props.children}</code>
    </pre>
  )
}

export default async function ToolsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) redirect('/app')

  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) {
    redirect('/access-denied')
  }

  const enableRunButtons = process.env.NEXT_PUBLIC_ENABLE_TOOLS_RUN === '1'

  return (
    <div className="px-6 py-10 md:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Tools</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Internal operator tools. In the current debug phase, we prefer copy/paste commands and payload previews over
        server-side script execution.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Card
          title="Onboarding (debug payload)"
          desc="Start a new onboarding intake. For now, the final step shows a full JSON payload preview (no Supabase writes, no deploy)."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200"
            >
              Create org (then onboard)
            </Link>
            <span className="text-xs text-slate-500">or</span>
            <span className="text-xs text-slate-500">
              open an existing org’s onboarding: <code className="rounded bg-slate-950 px-1 py-0.5">/clients/new?org_id=…</code>
            </span>
          </div>
        </Card>

        <Card
          title="Ingestion (debug-only)"
          desc="Existing ingestion endpoints exist, but the UI does not run them yet. Use the command templates below."
        >
          <Cmd>{`curl -X POST \\
  -H 'content-type: application/json' \\
  -d '{"orgId":"${operatorOrgId}","clientId":"<client-uuid>","locationId":"<location-uuid>"}' \\
  http://localhost:3000/api/jobs/ingest`}</Cmd>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Tip: run after coordinates + integrations are configured.</span>
            <button
              type="button"
              disabled={!enableRunButtons}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40"
              title="Disabled in debug phase"
            >
              Run now (disabled)
            </button>
          </div>
        </Card>

        <Card
          title="Validate intake payload (debug)"
          desc="Validate the onboarding JSON payload server-side (auth + RBAC + Zod). Does not write to Supabase."
        >
          <Cmd>{`curl -X POST \\
  -H 'content-type: application/json' \\
  -d @payload.json \\
  http://localhost:3000/api/onboarding/intake/validate`}</Cmd>
        </Card>

        <Card
          title="Keyword intelligence (test run)"
          desc="Run the keyword-intel pipeline against mock or real intake JSON (dry-run). Shows grid/landing/content keywords. Uses Maps SERP classification when center coordinates are provided."
        >
          <ToolsKeywordIntelRunner operatorOrgId={operatorOrgId} />
        </Card>

        <Card
          title="Script runs (live logs)"
          desc="Start a predefined script run on the server and watch logs live (saved to MongoDB)."
        >
          <ToolsScriptRunsLauncher operatorOrgId={operatorOrgId} enableRunButtons={enableRunButtons} />
        </Card>

        <Card
          title="Website onboarding pipeline"
          desc="This is executed via repo scripts (spawn/git/vercel). The app only prints the operator command in debug mode."
        >
          <Cmd>{`# from seo-data-platform repo root
npm run onboard:client -- --dry-run --keep-workspace

# to load public Cal fields from Supabase (requires service role key)
npm run onboard:client -- --client-id=<client-uuid> --keep-workspace`}</Cmd>
        </Card>

        <Card
          title="Go-live checklist (stub)"
          desc="Pre-launch SEO audit, GBP website link (Day 9+), and handoff doc will be added here after the intake payload is finalized."
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
            <li>Pre-launch SEO audit script (canonical, schema, sitemap)</li>
            <li>GBP: link website URL (after verification/manager-hold gate)</li>
            <li>Send handoff document (logins, SLA, GDPR notice)</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}

