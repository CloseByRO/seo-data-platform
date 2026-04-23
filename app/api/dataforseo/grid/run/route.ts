import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { dataForSeoRequest } from '@/lib/providers/dataforseo/client'

const bodySchema = z.object({
  orgId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  anchor: z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
    placeId: z.string().trim().min(1).max(300).optional(),
    locality: z.string().trim().max(200).optional(),
    county: z.string().trim().max(200).optional(),
  }),
  gridSpec: z.object({
    radius_m: z.number().int().min(100).max(20_000),
    size: z.number().int().min(3).max(9),
    step_m: z.number().int().min(50).max(10_000),
  }),
  keywords: z.array(z.string().trim().min(2).max(200)).min(1).max(120),
  dryRun: z.boolean().default(true),
  maxKeywords: z.number().int().min(1).max(20).default(3),
  maxPoints: z.number().int().min(1).max(81).default(25),
  zoom: z.number().int().min(3).max(21).optional(),
})

function defaultZoomForRadius(radiusM: number) {
  if (radiusM >= 4000) return 11
  if (radiusM >= 2500) return 12
  if (radiusM >= 1500) return 13
  if (radiusM >= 1000) return 14
  return 16
}

function metersToLat(meters: number) {
  return meters / 111_320
}

function metersToLng(meters: number, atLat: number) {
  const denom = 111_320 * Math.cos((atLat * Math.PI) / 180)
  return denom === 0 ? 0 : meters / denom
}

function buildGrid(centerLat: number, centerLng: number, size: number, stepM: number) {
  const half = Math.floor(size / 2)
  const points: Array<{ point_index: number; lat: number; lng: number }> = []

  let idx = 0
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      const dLat = metersToLat(y * stepM)
      const dLng = metersToLng(x * stepM, centerLat)
      points.push({ point_index: idx++, lat: centerLat + dLat, lng: centerLng + dLng })
    }
  }
  return points
}

type MapsResultItem = {
  type?: string
  rank_group?: number
  rank_absolute?: number
  title?: string
  place_id?: string
  rating?: { value?: number; votes_count?: number }
  address?: string
  url?: string
}

type DataForSeoMapsResult = { items?: MapsResultItem[] }

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

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const body = parsed.data
  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const keywordCount = Math.min(body.keywords.length, body.maxKeywords)
  const keywords = body.keywords.slice(0, keywordCount)

  const pointsAll = buildGrid(body.anchor.lat, body.anchor.lng, body.gridSpec.size, body.gridSpec.step_m)
  const points = pointsAll.slice(0, Math.min(pointsAll.length, body.maxPoints))
  const zoom = body.zoom ?? defaultZoomForRadius(body.gridSpec.radius_m)

  if (body.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      request: { ...body, keywords, zoom, pointsPreview: points.slice(0, 3) },
    })
  }

  const results: Array<{
    keyword: string
    points: Array<{ point_index: number; lat: number; lng: number; rank: number | null; top: Array<unknown> }>
    rankSummary: { min: number | null; max: number | null; avg: number | null; present: number; missing: number }
  }> = []

  for (const kw of keywords) {
    const perPoint: Array<{ point_index: number; lat: number; lng: number; rank: number | null; top: Array<unknown> }> = []
    for (const p of points) {
      const res = await dataForSeoRequest<DataForSeoMapsResult>('/v3/serp/google/maps/live/advanced', [
        {
          keyword: kw,
          language_code: 'ro',
          location_coordinate: `${p.lat},${p.lng},${zoom}z`,
          device: 'mobile',
          depth: 20,
          search_places: false,
        },
      ])

      const items = res.items ?? []
      const top = items
        .filter((i) => i.type === 'maps_search' || i.type === 'maps' || i.type === 'local_pack')
        .slice(0, 10)

      let rank: number | null = null
      if (body.anchor.placeId) {
        const match = top.find((i) => i.place_id === body.anchor.placeId)
        rank = match?.rank_absolute ?? match?.rank_group ?? null
      }

      perPoint.push({
        point_index: p.point_index,
        lat: p.lat,
        lng: p.lng,
        rank,
        top: top.map((i) => ({
          placeId: i.place_id ?? null,
          rank: i.rank_absolute ?? i.rank_group ?? null,
          title: i.title ?? null,
          rating: i.rating?.value ?? null,
          reviewCount: i.rating?.votes_count ?? null,
          url: i.url ?? null,
        })),
      })
    }

    const ranks = perPoint.map((x) => x.rank).filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
    const present = ranks.length
    const missing = perPoint.length - present
    const min = present ? Math.min(...ranks) : null
    const max = present ? Math.max(...ranks) : null
    const avg = present ? Math.round((ranks.reduce((a, b) => a + b, 0) / present) * 100) / 100 : null

    results.push({
      keyword: kw,
      points: perPoint,
      rankSummary: { min, max, avg, present, missing },
    })
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    keywordCount: keywords.length,
    pointCount: points.length,
    placeIdTracked: body.anchor.placeId ?? null,
    results,
  })
}

