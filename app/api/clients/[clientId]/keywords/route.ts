import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canMutateOrgData } from '@/lib/api/org-admin'
import { normalizeText } from '@/lib/clients/text'
import { putKeywordsBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

export async function PUT(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
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

  const parsed = putKeywordsBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data
  const orgId = body.orgId

  if (!(await canMutateOrgData(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const kws = body.keywords.map((k) => k.trim()).filter(Boolean)
  if (kws.length === 0) return NextResponse.json({ error: 'Provide at least 1 keyword' }, { status: 400 })

  const admin = createAdminClient()
  const { data: client } = await admin.from('clients').select('id').eq('id', clientId).eq('org_id', orgId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: existing } = await admin
    .from('keywords')
    .select('id,keyword_norm')
    .eq('client_id', clientId)
    .eq('org_id', orgId)

  const desiredNorms = new Set(kws.map((k) => normalizeText(k)))
  const toDelete = (existing ?? []).filter((row) => !desiredNorms.has(row.keyword_norm)).map((r) => r.id)
  if (toDelete.length > 0) {
    const { error: delErr } = await admin.from('keywords').delete().in('id', toDelete)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })
  }

  const rows = kws.map((kw) => ({
    org_id: orgId,
    client_id: clientId,
    locale: 'ro-RO' as const,
    keyword_raw: kw,
    keyword_norm: normalizeText(kw),
  }))

  const { error: upErr } = await admin.from('keywords').upsert(rows, {
    onConflict: 'org_id,client_id,locale,keyword_norm',
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
