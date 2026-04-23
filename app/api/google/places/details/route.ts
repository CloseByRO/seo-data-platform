import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { placesDetailsBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

type GooglePlacesDetailsResponse = {
  status: string
  error_message?: string
  result?: {
    formatted_address?: string
    geometry?: { location?: { lat?: number; lng?: number } }
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  }
}

function findComponent(
  comps: NonNullable<GooglePlacesDetailsResponse['result']>['address_components'],
  type: string,
) {
  return comps?.find((c) => c.types.includes(type)) ?? null
}

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

  const parsed = placesDetailsBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 500 })

  const params = new URLSearchParams({
    place_id: body.placeId,
    key: apiKey,
    language: body.language ?? 'ro',
    fields: 'formatted_address,geometry,address_components',
  })

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`)
  const json = (await res.json()) as GooglePlacesDetailsResponse

  if (!res.ok || json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
    return NextResponse.json(
      { error: json.error_message ?? `Places details failed: ${json.status}` },
      { status: 502 },
    )
  }

  const lat = json.result?.geometry?.location?.lat
  const lng = json.result?.geometry?.location?.lng
  const formattedAddress = json.result?.formatted_address ?? null

  const comps = json.result?.address_components ?? []
  const locality =
    findComponent(comps, 'locality')?.long_name ??
    findComponent(comps, 'postal_town')?.long_name ??
    null
  const region = findComponent(comps, 'administrative_area_level_1')?.long_name ?? null
  const admin2 = findComponent(comps, 'administrative_area_level_2')?.long_name ?? null
  const sector =
    region && region.toLowerCase().includes('bucure') && admin2 && /sector\s*\d/i.test(admin2)
      ? admin2.trim()
      : null
  const neighborhood =
    findComponent(comps, 'neighborhood')?.long_name ??
    findComponent(comps, 'sublocality')?.long_name ??
    findComponent(comps, 'sublocality_level_1')?.long_name ??
    null

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Missing geometry from Places details' }, { status: 502 })
  }

  return NextResponse.json({
    placeId: body.placeId,
    formattedAddress,
    lat,
    lng,
    locality,
    region,
    sector,
    neighborhood,
  })
}
