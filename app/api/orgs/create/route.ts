import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformOperatorAdmin } from '@/lib/rbac/server'
import { orgCreateBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await isPlatformOperatorAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden: only CloseBy platform admins can create organizations' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = orgCreateBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const name = parsed.data.name

  const admin = createAdminClient()

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name, is_platform_operator: false })
    .select('id')
    .single()

  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 })

  const { error: memErr } = await admin.from('org_memberships').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  })

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  await admin.from('org_integrations').upsert({ org_id: org.id }, { onConflict: 'org_id' })

  return NextResponse.json({ ok: true, orgId: org.id })
}
