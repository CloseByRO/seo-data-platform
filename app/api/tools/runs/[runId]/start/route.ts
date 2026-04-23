import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { spawn } from 'node:child_process'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { getRepoRoot, getScriptSpec } from '@/lib/tools/scripts'
import { toolsLogsCollection, toolsRunsCollection, type ToolsLogLevel, type ToolsLogStream } from '@/lib/tools/mongo'

const bodySchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['dry', 'real']),
})

function levelFromStream(stream: ToolsLogStream): ToolsLogLevel {
  if (stream === 'stderr') return 'error'
  return 'info'
}

function splitLines(buf: string) {
  return buf.split(/\r?\n/g).map((s) => s.trimEnd())
}

export async function POST(request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await ctx.params
  if (!runId || !ObjectId.isValid(runId)) return NextResponse.json({ error: 'Invalid runId' }, { status: 400 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const runs = await toolsRunsCollection(body.kind)
  const logs = await toolsLogsCollection(body.kind)

  const _id = new ObjectId(runId)
  const run = await runs.findOne({ _id, orgId: body.orgId })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (run.status === 'running') return NextResponse.json({ ok: true, alreadyRunning: true })

  const spec = getScriptSpec(run.scriptId)
  if (!spec) {
    await runs.updateOne({ _id }, { $set: { status: 'failed', finishedAt: new Date(), errorSummary: 'Unknown scriptId' } })
    return NextResponse.json({ error: 'Unknown scriptId' }, { status: 400 })
  }

  const repoRoot = getRepoRoot()
  const { cmd, args, cwd } = spec.buildCommand({ repoRoot, params: run.params })

  await runs.updateOne(
    { _id },
    { $set: { status: 'running', startedAt: new Date(), exitCode: null, errorSummary: null }, $unset: { finishedAt: '' } },
  )

  let seq = 0
  async function writeLog(stream: ToolsLogStream, message: string) {
    const lines = splitLines(message).filter((x) => x.length > 0)
    if (!lines.length) return
    const docs = lines.map((line) => ({
      _id: new ObjectId(),
      runId: _id,
      seq: ++seq,
      ts: new Date(),
      level: levelFromStream(stream),
      stream,
      message: line,
    }))
    await logs.insertMany(docs)
  }

  await writeLog('system', `spawn: ${cmd} ${args.join(' ')}`)

  const child = spawn(cmd, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const timeout = setTimeout(async () => {
    await writeLog('system', `timeout: killing process after ${spec.timeoutMs}ms`)
    child.kill('SIGKILL')
  }, spec.timeoutMs)

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')

  child.stdout?.on('data', (d: string) => void writeLog('stdout', d))
  child.stderr?.on('data', (d: string) => void writeLog('stderr', d))

  child.on('error', async (e) => {
    clearTimeout(timeout)
    await writeLog('system', `spawn error: ${e instanceof Error ? e.message : String(e)}`)
    await runs.updateOne({ _id }, { $set: { status: 'failed', finishedAt: new Date(), exitCode: null, errorSummary: 'spawn_error' } })
  })

  child.on('close', async (code) => {
    clearTimeout(timeout)
    const status = code === 0 ? 'success' : 'failed'
    await writeLog('system', `exit: ${code ?? 'null'}`)
    await runs.updateOne(
      { _id },
      { $set: { status, finishedAt: new Date(), exitCode: code ?? null, errorSummary: status === 'failed' ? `exit_${code ?? 'null'}` : null } },
    )
  })

  return NextResponse.json({ ok: true, started: true })
}

