import { setTimeout as sleep } from 'node:timers/promises'

type Args = {
  baseUrl: string
  orgId: string
  kind: 'dry' | 'real'
  scriptId: string
}

function parseArgs(argv: string[]): Args {
  const a = new Map<string, string>()
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/)
    if (!m) continue
    a.set(m[1], m[2])
  }
  const baseUrl = a.get('base-url') ?? 'http://localhost:3000'
  const orgId = a.get('org-id') ?? ''
  const kind = (a.get('kind') === 'real' ? 'real' : 'dry') as Args['kind']
  const scriptId = a.get('script-id') ?? 'keyword_intel_smoke'
  if (!orgId) throw new Error('Missing --org-id')
  return { baseUrl, orgId, kind, scriptId }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const createRes = await fetch(`${args.baseUrl}/api/tools/runs/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orgId: args.orgId, kind: args.kind, scriptId: args.scriptId, params: {} }),
  })
  const created = (await createRes.json()) as { ok?: boolean; runId?: string; error?: unknown }
  if (!createRes.ok || !created.runId) throw new Error(`Create failed: ${JSON.stringify(created)}`)

  const runId = created.runId
  console.log(`runId=${runId}`)

  const startRes = await fetch(`${args.baseUrl}/api/tools/runs/${runId}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orgId: args.orgId, kind: args.kind }),
  })
  const started = (await startRes.json()) as { ok?: boolean; error?: unknown }
  if (!startRes.ok) throw new Error(`Start failed: ${JSON.stringify(started)}`)

  let afterSeq = 0
  console.log('Streaming logs (polling SSE endpoint)...')
  while (true) {
    const url = new URL(`${args.baseUrl}/api/tools/runs/${runId}/stream`)
    url.searchParams.set('orgId', args.orgId)
    url.searchParams.set('kind', args.kind)
    url.searchParams.set('afterSeq', String(afterSeq))

    const res = await fetch(url)
    const text = await res.text()
    // SSE is not trivial to parse in a small script; we just print the raw events for now.
    process.stdout.write(text)

    // update afterSeq by scanning last log seq in the chunk
    const matches = [...text.matchAll(/"seq"\s*:\s*(\d+)/g)]
    const last = matches[matches.length - 1]?.[1]
    if (last) afterSeq = Math.max(afterSeq, Number(last))

    await sleep(1200)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

