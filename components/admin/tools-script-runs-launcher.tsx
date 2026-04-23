"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'

type ScriptSpecLite = { id: string; label: string; dryAllowed: boolean; realAllowed: boolean }

const SCRIPTS: ScriptSpecLite[] = [
  { id: 'keyword_intel_smoke', label: 'Keyword intel smoke (fixtures)', dryAllowed: true, realAllowed: false },
  { id: 'onboard_client_dry', label: 'Onboard client (dry-run)', dryAllowed: true, realAllowed: false },
]

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function ToolsScriptRunsLauncher(props: { operatorOrgId: string; enableRunButtons: boolean }) {
  const [kind, setKind] = useState<'dry' | 'real'>('dry')
  const [scriptId, setScriptId] = useState<string>(SCRIPTS[0]?.id ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const spec = useMemo(() => SCRIPTS.find((s) => s.id === scriptId) ?? null, [scriptId])
  const allowed = spec ? (kind === 'dry' ? spec.dryAllowed : spec.realAllowed) : false

  async function startRun() {
    if (!props.enableRunButtons) return
    if (!spec || !allowed) return

    setRunning(true)
    setStatus(null)
    try {
      const create = await fetch('/api/tools/runs/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId: props.operatorOrgId, kind, scriptId, params: {} }),
      })
      const created = (await create.json()) as { ok?: boolean; runId?: string; error?: unknown }
      if (!create.ok || !created.runId) {
        setStatus(`Create failed: ${JSON.stringify(created.error ?? created)}`)
        return
      }

      const start = await fetch(`/api/tools/runs/${created.runId}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId: props.operatorOrgId, kind }),
      })
      const started = (await start.json()) as { ok?: boolean; error?: unknown }
      if (!start.ok) {
        setStatus(`Start failed: ${JSON.stringify(started.error ?? started)}`)
        return
      }

      // Navigate to run page
      window.location.href = `/app/tools/runs/${created.runId}?kind=${kind}&orgId=${props.operatorOrgId}`
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/tools/runs?orgId=${props.operatorOrgId}&kind=${kind}`}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
          >
            View runs
          </Link>
          <Link
            href={`/app/tools/data`}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-900"
          >
            Data / logs
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void startRun()}
          disabled={!props.enableRunButtons || !allowed || running}
          className={clsx(
            'rounded-lg px-3 py-2 text-xs font-medium',
            props.enableRunButtons && allowed && !running
              ? 'bg-white text-slate-950 hover:bg-slate-200'
              : 'bg-slate-800 text-slate-400 cursor-not-allowed',
          )}
          title={!props.enableRunButtons ? 'Set NEXT_PUBLIC_ENABLE_TOOLS_RUN=1' : !allowed ? 'Not allowed for this run kind' : ''}
        >
          {running ? 'Starting…' : 'Start run'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Run kind</label>
          <select
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={kind}
            onChange={(e) => setKind(e.target.value === 'real' ? 'real' : 'dry')}
          >
            <option value="dry">dry</option>
            <option value="real" disabled>
              real (disabled)
            </option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Script</label>
          <select
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            value={scriptId}
            onChange={(e) => setScriptId(e.target.value)}
          >
            {SCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status ? <div className="text-xs text-rose-300">{status}</div> : null}
      {!allowed ? <div className="text-xs text-slate-500">This script is not allowed for the selected run kind.</div> : null}
    </div>
  )
}

