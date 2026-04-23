import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'
import { TOOLS_RUNS_COLLECTION, TOOLS_RUN_LOGS_COLLECTION, getToolsDb } from '@/lib/tools/mongo'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  skip: z.coerce.number().int().min(0).max(50_000).default(0),
})

const allowed = new Set<string>([
  TOOLS_RUNS_COLLECTION.dry,
  TOOLS_RUNS_COLLECTION.real,
  TOOLS_RUN_LOGS_COLLECTION.dry,
  TOOLS_RUN_LOGS_COLLECTION.real,
])

export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) return NextResponse.json({ error: 'No operator org' }, { status: 400 })
  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await ctx.params
  if (!allowed.has(name)) return NextResponse.json({ error: 'Collection not allowed' }, { status: 400 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    skip: url.searchParams.get('skip') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const db = await getToolsDb()
  const rows = await db
    .collection(name)
    .find({})
    .sort({ _id: -1 })
    .skip(parsed.data.skip)
    .limit(parsed.data.limit)
    .toArray()

  return NextResponse.json({ ok: true, name, skip: parsed.data.skip, limit: parsed.data.limit, rows })
}

