import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canMutateOrgData } from '@/lib/api/org-admin'
import { normalizeClientSlug } from '@/lib/clients/text'
import { patchClientBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'
import { z } from 'zod'

const deleteQuerySchema = z.object({
  org_id: z.string().uuid(),
})

export async function PATCH(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
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

  const parsed = patchClientBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data
  const orgId = body.orgId

  if (!(await canMutateOrgData(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin.from('clients').select('id').eq('id', clientId).eq('org_id', orgId).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.displayName !== undefined) {
    const dn = body.displayName.trim()
    if (!dn) return NextResponse.json({ error: 'displayName cannot be empty' }, { status: 400 })
    patch.display_name = dn
  }
  if (body.clientSlug !== undefined) {
    const slug = normalizeClientSlug(body.clientSlug)
    if (!slug) return NextResponse.json({ error: 'clientSlug cannot be empty' }, { status: 400 })
    patch.client_slug = slug
  }
  if (body.primaryDomain !== undefined) {
    const d = body.primaryDomain === null ? '' : String(body.primaryDomain).trim()
    patch.primary_domain = d || null
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin.from('clients').update(patch).eq('id', clientId).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const q = deleteQuerySchema.safeParse({ org_id: url.searchParams.get('org_id') })
  if (!q.success) {
    return NextResponse.json({ error: 'Missing or invalid org_id' }, { status: 400 })
  }

  const orgId = q.data.org_id

  if (!(await canMutateOrgData(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('clients').delete().eq('id', clientId).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
