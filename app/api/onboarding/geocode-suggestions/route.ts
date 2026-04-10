import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { geocodeSuggestionsBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

type NominatimItem = {
  lat: string
  lon: string
  display_name?: string
  address?: {
    city?: string
    town?: string
    village?: string
    suburb?: string
    neighbourhood?: string
    state?: string
    county?: string
    country?: string
  }
}

function cityFromAddress(a: NominatimItem['address']): string | null {
  if (!a) return null
  return (
    a.city ?? a.town ?? a.village ?? a.suburb ?? a.neighbourhood ?? a.county ?? a.state ?? null
  )
}

function buildKeywordSuggestions(displayName: string, city: string | null, region: string | null): string[] {
  const name = displayName.trim()
  const fallbackName = name || 'business'

  const c = (city ?? '').trim()
  const r = (region ?? '').trim()
  const parts = fallbackName.split(/\s+/).filter(Boolean)
  const firstWord = parts[0] ?? fallbackName

  const raw: string[] = [
    c ? `${fallbackName} ${c}` : `${fallbackName} local`,
    c && r ? `${fallbackName} ${c} ${r}` : c ? `${fallbackName} ${c} online` : `${fallbackName} services`,
    c ? `${c} ${fallbackName}` : `${fallbackName} near me`,
    `${fallbackName} near me`,
    c ? `${firstWord} ${c}` : `${fallbackName} reviews`,
    c ? `${fallbackName} programări ${c}` : `${fallbackName} contact`,
    c ? `${fallbackName} ${c} centru` : `${fallbackName} program`,
    r ? `${fallbackName} ${r}` : `${fallbackName} servicii`,
  ].filter((s) => s.length > 0)

  const seen = new Set<string>()
  const out: string[] = []
  for (const s of raw) {
    const k = s.toLowerCase().trim()
    if (k.length < 3) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s.trim())
    if (out.length >= 8) break
  }

  let n = 1
  while (out.length < 5) {
    const pad = c ? `${fallbackName} ${c} ${n}` : `${fallbackName} keyword ${n}`
    n += 1
    const key = pad.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pad)
  }

  return out
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

  const parsed = geocodeSuggestionsBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const address = body.address.trim()
  const displayName = (body.displayName ?? '').trim()

  const q = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'seo-data-platform/1.0 (local-seo onboarding; contact: app)',
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Geocoding failed: ${res.status}` }, { status: 502 })
  }

  const data = (await res.json()) as NominatimItem[]
  const hit = data[0]
  if (!hit) {
    return NextResponse.json({ error: 'No results for this address' }, { status: 404 })
  }

  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates from geocoder' }, { status: 502 })
  }

  const city = cityFromAddress(hit.address)
  const region = hit.address?.state ?? hit.address?.county ?? null

  const suggestions = buildKeywordSuggestions(displayName || 'business', city, region)

  return NextResponse.json({
    lat,
    lng,
    formattedAddress: hit.display_name ?? address,
    city,
    region,
    suggestions,
  })
}
