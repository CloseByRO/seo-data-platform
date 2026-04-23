"use client"

import { useEffect, useMemo, useRef, useState } from 'react'

type LogLine = {
  seq: number
  ts: string
  level: 'debug' | 'info' | 'warn' | 'error'
  stream: 'stdout' | 'stderr' | 'system'
  message: string
}

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function colorFor(line: LogLine) {
  if (line.level === 'error' || line.stream === 'stderr') return 'text-rose-300'
  if (line.level === 'warn') return 'text-amber-300'
  if (line.stream === 'system') return 'text-slate-400'
  if (line.level === 'debug') return 'text-slate-400'
  return 'text-emerald-200/90'
}

export function ToolsRunTerminal(props: { runId: string; orgId: string; kind: 'dry' | 'real' }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [status, setStatus] = useState<string>('connecting')
  const [error, setError] = useState<string | null>(null)
  const afterSeq = useRef(0)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const url = useMemo(() => {
    const qs = new URLSearchParams({ orgId: props.orgId, kind: props.kind, afterSeq: String(afterSeq.current) })
    return `/api/tools/runs/${props.runId}/stream?${qs.toString()}`
  }, [props.kind, props.orgId, props.runId])

  useEffect(() => {
    setLines([])
    setError(null)
    setStatus('connecting')
    afterSeq.current = 0

    const qs = new URLSearchParams({ orgId: props.orgId, kind: props.kind, afterSeq: '0' })
    const es = new EventSource(`/api/tools/runs/${props.runId}/stream?${qs.toString()}`)

    es.addEventListener('meta', () => {
      setStatus('streaming')
    })
    es.addEventListener('status', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { status?: string; exitCode?: number | null; errorSummary?: string | null }
        const s = data.status ?? 'unknown'
        if (s === 'success') setStatus('success')
        else if (s === 'failed') setStatus('failed')
        else setStatus(s)
      } catch {
        // ignore
      }
    })
    es.addEventListener('log', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as LogLine
        afterSeq.current = Math.max(afterSeq.current, data.seq)
        setLines((prev) => (prev.length > 5000 ? [...prev.slice(-2500), data] : [...prev, data]))
      } catch {
        // ignore
      }
    })
    es.onerror = () => {
      setError('Stream disconnected (will require refresh).')
      setStatus('disconnected')
      es.close()
    }

    return () => es.close()
  }, [props.kind, props.orgId, props.runId])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          status:{' '}
          <span
            className={clsx(
              'font-medium',
              status === 'failed' ? 'text-rose-300' : status === 'success' ? 'text-emerald-300' : 'text-slate-200',
            )}
          >
            {status}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">tail afterSeq={afterSeq.current}</div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3 text-xs text-rose-200">{error}</div>
      ) : null}

      <div ref={boxRef} className="h-[520px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
        {lines.length ? (
          <div className="space-y-1 font-mono text-xs">
            {lines.map((l) => (
              <div key={l.seq} className={clsx('whitespace-pre-wrap wrap-break-word', colorFor(l))}>
                <span className="text-slate-600">[{l.seq}]</span> {l.message}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">No logs yet.</div>
        )}
      </div>
    </div>
  )
}

