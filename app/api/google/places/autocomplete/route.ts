import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { placesAutocompleteBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

type GooglePlacesAutocompleteResponse = {
  status: string
  error_message?: string
  predictions?: Array<{
    description: string
    place_id: string
  }>
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

  const parsed = placesAutocompleteBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 500 })

  const input = (body.input ?? '').trim()
  if (input.length < 3) return NextResponse.json({ predictions: [] })

  const params = new URLSearchParams({
    input,
    key: apiKey,
    types: 'address',
    language: body.language ?? 'ro',
    region: body.region ?? 'ro',
  })

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`)
  const json = (await res.json()) as GooglePlacesAutocompleteResponse

  if (!res.ok || json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
    return NextResponse.json(
      { error: json.error_message ?? `Places autocomplete failed: ${json.status}` },
      { status: 502 },
    )
  }

  const predictions =
    (json.predictions ?? []).map((p) => ({ description: p.description, placeId: p.place_id })) ?? []

  return NextResponse.json({ predictions })
}
