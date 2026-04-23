import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { toolsRunsCollection, type ToolsRunDoc } from '@/lib/tools/mongo'

const querySchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['dry', 'real']).default('dry'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    orgId: url.searchParams.get('orgId'),
    kind: url.searchParams.get('kind') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const q = parsed.data

  if (!(await canMutateOrgData(supabase, q.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const col = await toolsRunsCollection(q.kind)
  const rows = await col
    .find({ orgId: q.orgId } as Partial<ToolsRunDoc>)
    .sort({ createdAt: -1 })
    .limit(q.limit)
    .toArray()

  return NextResponse.json({
    ok: true,
    runs: rows.map((r) => ({
      id: (r._id as ObjectId).toHexString(),
      orgId: r.orgId,
      kind: r.kind,
      scriptId: r.scriptId,
      scriptLabel: r.scriptLabel,
      status: r.status,
      createdAt: r.createdAt,
      startedAt: r.startedAt ?? null,
      finishedAt: r.finishedAt ?? null,
      exitCode: r.exitCode ?? null,
      errorSummary: r.errorSummary ?? null,
    })),
  })
}

