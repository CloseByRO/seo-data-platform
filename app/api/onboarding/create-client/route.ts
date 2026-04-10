import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canMutateOrgData } from '@/lib/rbac/server'
import { addressHash, normalizeClientSlug, normalizeText } from '@/lib/clients/text'
import { onboardingCreateClientBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

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

  const parsed = onboardingCreateClientBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const clientSlug = normalizeClientSlug(body.clientSlug)
  const displayName = body.displayName.trim()
  if (!clientSlug || !displayName) return NextResponse.json({ error: 'Missing client fields' }, { status: 400 })

  const locAddress = body.location.addressText.trim()
  if (!locAddress) return NextResponse.json({ error: 'Missing address' }, { status: 400 })

  const kws = body.keywords.map((k) => k.trim()).filter(Boolean)
  if (kws.length === 0) return NextResponse.json({ error: 'Provide at least 1 keyword' }, { status: 400 })

  const admin = createAdminClient()

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      org_id: body.orgId,
      client_slug: clientSlug,
      display_name: displayName,
      primary_domain: body.primaryDomain?.trim() || null,
    })
    .select('id')
    .single()

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 400 })

  const { data: location, error: locErr } = await admin
    .from('locations')
    .insert({
      org_id: body.orgId,
      client_id: client.id,
      gbp_location_id: body.location.gbpLocationId,
      place_id: body.location.placeId,
      address_text: locAddress,
      address_hash: addressHash(locAddress),
      lat: body.location.lat,
      lng: body.location.lng,
    })
    .select('id')
    .single()

  if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 })

  const keywordRows = kws.map((kw) => ({
    org_id: body.orgId,
    client_id: client.id,
    locale: 'ro-RO' as const,
    keyword_raw: kw,
    keyword_norm: normalizeText(kw),
  }))

  const { error: kwErr } = await admin.from('keywords').upsert(keywordRows, {
    onConflict: 'org_id,client_id,locale,keyword_norm',
  })

  if (kwErr) return NextResponse.json({ error: kwErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, clientId: client.id, locationId: location.id })
}
