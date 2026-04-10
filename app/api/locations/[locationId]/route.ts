import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canMutateOrgData } from '@/lib/api/org-admin'
import { addressHash } from '@/lib/clients/text'
import { patchLocationBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

export async function PATCH(request: Request, ctx: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await ctx.params
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

  const parsed = patchLocationBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data
  const orgId = body.orgId

  if (!(await canMutateOrgData(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('locations')
    .select('id,address_text')
    .eq('id', locationId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.addressText !== undefined) {
    const addr = String(body.addressText).trim()
    if (!addr) return NextResponse.json({ error: 'addressText cannot be empty' }, { status: 400 })
    patch.address_text = addr
    patch.address_hash = addressHash(addr)
  }
  if (body.lat !== undefined) patch.lat = body.lat
  if (body.lng !== undefined) patch.lng = body.lng
  if (body.placeId !== undefined) patch.place_id = body.placeId === null || body.placeId === '' ? null : String(body.placeId)
  if (body.gbpLocationId !== undefined) {
    patch.gbp_location_id =
      body.gbpLocationId === null || body.gbpLocationId === '' ? null : String(body.gbpLocationId)
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin.from('locations').update(patch).eq('id', locationId).eq('org_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
