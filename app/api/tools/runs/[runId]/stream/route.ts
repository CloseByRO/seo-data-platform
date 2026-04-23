import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { toolsLogsCollection, toolsRunsCollection } from '@/lib/tools/mongo'

const querySchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['dry', 'real']).default('dry'),
  afterSeq: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    orgId: url.searchParams.get('orgId'),
    kind: url.searchParams.get('kind') ?? undefined,
    afterSeq: url.searchParams.get('afterSeq') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const q = parsed.data

  if (!(await canMutateOrgData(supabase, q.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { runId } = await ctx.params
  if (!runId || !ObjectId.isValid(runId)) return NextResponse.json({ error: 'Invalid runId' }, { status: 400 })

  const runObjectId = new ObjectId(runId)
  const runs = await toolsRunsCollection(q.kind)
  const run = await runs.findOne({ _id: runObjectId, orgId: q.orgId })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const logs = await toolsLogsCollection(q.kind)

  const encoder = new TextEncoder()
  let lastSeq = q.afterSeq

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send('meta', { runId, status: run.status, afterSeq: lastSeq })

      // Heartbeat + polling loop
      while (!request.signal.aborted) {
        const rows = await logs
          .find({ runId: runObjectId, seq: { $gt: lastSeq } })
          .sort({ seq: 1 })
          .limit(250)
          .toArray()

        for (const r of rows) {
          lastSeq = r.seq
          send('log', {
            seq: r.seq,
            ts: r.ts,
            level: r.level,
            stream: r.stream,
            message: r.message,
          })
        }

        // Also send updated run status occasionally
        const updated = await runs.findOne({ _id: runObjectId }, { projection: { status: 1, exitCode: 1, errorSummary: 1, finishedAt: 1 } })
        if (updated) send('status', updated)

        // sleep
        await new Promise((r) => setTimeout(r, rows.length ? 250 : 800))
      }

      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}

