import { createAdminClient } from '@/lib/supabase/admin'
import { dataForSeoRequest } from '@/lib/providers/dataforseo/client'
import { enumerateDates } from '@/lib/jobs/date-range'

function normalizeText(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

function metersToLat(meters: number) {
  return meters / 111_320
}

function metersToLng(meters: number, atLat: number) {
  const denom = 111_320 * Math.cos((atLat * Math.PI) / 180)
  return denom === 0 ? 0 : meters / denom
}

function defaultZoomForRadius(radiusM: number) {
  if (radiusM >= 4000) return 11
  if (radiusM >= 2500) return 12
  if (radiusM >= 1500) return 13
  if (radiusM >= 1000) return 14
  return 16
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

type DataForSeoMapsResult = {
  items?: MapsResultItem[]
}

export async function ingestSerpGrid(params: {
  orgId: string
  clientId: string
  locationId: string
  keywordIds?: string[]
  startDate: string
  endDate: string
  provider: string
}) {
  const admin = createAdminClient()

  const { data: location, error: locErr } = await admin
    .from('locations')
    .select('lat,lng,place_id,address_text,address_hash')
    .eq('id', params.locationId)
    .eq('org_id', params.orgId)
    .single()

  if (locErr) throw locErr
  if (!location.lat || !location.lng) throw new Error('Location missing lat/lng')

  // Ensure grid spec exists (default 5x5)
  const { data: gridSpec, error: gsErr } = await admin
    .from('grid_specs')
    .upsert(
      {
        org_id: params.orgId,
        location_id: params.locationId,
        shape: 'square',
        size: 5,
        radius_m: 2000,
        step_m: 1000,
        version: 1,
      },
      { onConflict: 'location_id,shape,size,radius_m,step_m,version' },
    )
    .select('id,size,step_m,radius_m')
    .single()

  if (gsErr) throw gsErr

  // Ensure grid points exist deterministically
  const points = buildGrid(location.lat, location.lng, gridSpec.size, gridSpec.step_m)
  const { error: gpErr } = await admin
    .from('grid_points')
    .upsert(
      points.map((p) => ({
        org_id: params.orgId,
        grid_spec_id: gridSpec.id,
        point_index: p.point_index,
        lat: p.lat,
        lng: p.lng,
      })),
      { onConflict: 'grid_spec_id,point_index' },
    )

  if (gpErr) throw gpErr

  const { data: dbPoints, error: dbpErr } = await admin
    .from('grid_points')
    .select('id,point_index,lat,lng')
    .eq('grid_spec_id', gridSpec.id)
    .order('point_index', { ascending: true })

  if (dbpErr) throw dbpErr

  const { data: keywords, error: kwErr } = await admin
    .from('keywords')
    .select('id,keyword_raw,locale')
    .eq('org_id', params.orgId)
    .eq('client_id', params.clientId)
    .in('id', params.keywordIds ?? [])

  if (kwErr) throw kwErr

  const kwList =
    params.keywordIds && params.keywordIds.length > 0
      ? keywords
      : (
          await admin
            .from('keywords')
            .select('id,keyword_raw,locale')
            .eq('org_id', params.orgId)
            .eq('client_id', params.clientId)
        ).data ?? []

  if (!kwList || kwList.length === 0) throw new Error('No keywords for client')

  const days = enumerateDates(params.startDate, params.endDate)
  const zoom = defaultZoomForRadius(gridSpec.radius_m)

  for (const day of days) {
    for (const kw of kwList) {
      for (const p of dbPoints) {
        const result = await dataForSeoRequest<DataForSeoMapsResult>(
          '/v3/serp/google/maps/live/advanced',
          [
            {
              keyword: kw.keyword_raw,
              language_code: (kw.locale ?? 'ro-RO').split('-')[0],
              location_coordinate: `${p.lat},${p.lng},${zoom}z`,
              device: 'mobile',
              depth: 20,
              search_places: false,
            },
          ],
        )

        const items = result.items ?? []
        const top = items
          .filter((i) => i.type === 'maps_search' || i.type === 'maps' || i.type === 'local_pack')
          .slice(0, 10)

        // Upsert entities by place_id when present
        const entityIdsByPlaceId = new Map<string, string>()
        for (const item of top) {
          if (!item.place_id) continue
          const name = item.title ?? ''
          const nameNorm = normalizeText(name)
          const { data: ent, error: entErr } = await admin
            .from('serp_entities')
            .upsert(
              {
                org_id: params.orgId,
                place_id: item.place_id,
                name,
                name_norm: nameNorm,
                address_text: item.address ?? null,
                address_hash: item.address ? normalizeText(item.address) : null,
                website: item.url ?? null,
              },
              { onConflict: 'org_id,place_id' },
            )
            .select('id,place_id')
            .single()
          if (entErr) throw entErr
          entityIdsByPlaceId.set(ent.place_id, ent.id)
        }

        const observationTop = top.map((item) => ({
          entityId: item.place_id ? entityIdsByPlaceId.get(item.place_id) ?? null : null,
          placeId: item.place_id ?? null,
          rank: item.rank_absolute ?? item.rank_group ?? null,
          title: item.title ?? null,
          rating: item.rating?.value ?? null,
          reviewCount: item.rating?.votes_count ?? null,
        }))

        // Compute rank for the client entity if place_id matches
        let rank: number | null = null
        if (location.place_id) {
          const match = top.find((i) => i.place_id === location.place_id)
          rank = match?.rank_absolute ?? match?.rank_group ?? null
        }

        const { error: obsErr } = await admin.from('serp_grid_observations').upsert(
          {
            org_id: params.orgId,
            keyword_id: kw.id,
            grid_point_id: p.id,
            provider: params.provider,
            observed_date: day,
            rank,
            top_entities: observationTop,
            raw_payload: null,
          },
          { onConflict: 'keyword_id,grid_point_id,observed_date,provider' },
        )
        if (obsErr) throw obsErr
      }
    }
  }
}

