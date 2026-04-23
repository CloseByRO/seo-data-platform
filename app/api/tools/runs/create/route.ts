import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { getScriptSpec } from '@/lib/tools/scripts'
import { toolsRunsCollection } from '@/lib/tools/mongo'

const bodySchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['dry', 'real']),
  scriptId: z.string().min(1).max(200),
  params: z.record(z.unknown()).default({}),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const spec = getScriptSpec(body.scriptId)
  if (!spec) return NextResponse.json({ error: 'Unknown scriptId' }, { status: 400 })
  if (body.kind === 'dry' && !spec.dryAllowed) return NextResponse.json({ error: 'Script not allowed for dry runs' }, { status: 400 })
  if (body.kind === 'real' && !spec.realAllowed) return NextResponse.json({ error: 'Script not allowed for real runs' }, { status: 400 })

  let params: unknown
  try {
    params = spec.paramsSchema.parse(body.params ?? {})
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }

  try {
    const col = await toolsRunsCollection(body.kind)
    const doc = {
      _id: new ObjectId(),
      orgId: body.orgId,
      userId: user.id,
      kind: body.kind,
      scriptId: spec.id,
      scriptLabel: spec.label,
      status: 'queued' as const,
      createdAt: new Date(),
      params: (params ?? {}) as Record<string, unknown>,
    }

    await col.insertOne(doc)
    return NextResponse.json({ ok: true, runId: doc._id.toHexString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: 'MongoDB error',
        message: msg,
        hint:
          'Check MONGODB_URI. If your password contains special characters (e.g. !, @, #), it must be URL-encoded in the connection string.',
      },
      { status: 500 },
    )
  }
}

