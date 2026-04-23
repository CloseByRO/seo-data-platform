import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getOperatorOrgId, canMutateOrgData } from '@/lib/rbac/server'
import { TOOLS_RUNS_COLLECTION, TOOLS_RUN_LOGS_COLLECTION, getToolsDb } from '@/lib/tools/mongo'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const operatorOrgId = await getOperatorOrgId(supabase)
  if (!operatorOrgId) return NextResponse.json({ error: 'No operator org' }, { status: 400 })
  if (!(await canMutateOrgData(supabase, operatorOrgId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = await getToolsDb()
  const names = [
    TOOLS_RUNS_COLLECTION.dry,
    TOOLS_RUNS_COLLECTION.real,
    TOOLS_RUN_LOGS_COLLECTION.dry,
    TOOLS_RUN_LOGS_COLLECTION.real,
  ]

  const counts = await Promise.all(
    names.map(async (name) => {
      try {
        const c = await db.collection(name).estimatedDocumentCount()
        return [name, c] as const
      } catch {
        return [name, 0] as const
      }
    }),
  )

  return NextResponse.json({
    ok: true,
    collections: names.map((name) => ({ name, estimatedCount: counts.find((x) => x[0] === name)?.[1] ?? 0 })),
  })
}

