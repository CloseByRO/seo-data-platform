import { dataForSeoRequest } from '@/lib/providers/dataforseo/client'

export type MapsSerpClassifyResult = {
  keyword: string
  class: 'grid' | 'landing' | 'content'
  hasLocalPack: boolean
  reason: 'maps_serp' | 'fallback_heuristic' | 'unsupported'
}

function keywordNorm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function defaultZoomForRadius(radiusM: number) {
  if (radiusM >= 4000) return 11
  if (radiusM >= 2500) return 12
  if (radiusM >= 1500) return 13
  if (radiusM >= 1000) return 14
  return 16
}

type DataForSeoMapsResult = {
  items?: Array<{ type?: string; rank_absolute?: number; title?: string; place_id?: string }>
}

function isGeoKeyword(k: string) {
  const n = keywordNorm(k)
  return /\b(sector\s+[1-6]|bucuresti|cluj|iasi|timisoara|brasov|constanta|craiova)\b/.test(n)
}

export async function classifyKeywordsByMapsSerp(args: {
  keywords: string[]
  opts: {
    language_code: string
    centerLat: number
    centerLng: number
    radiusM?: number
  }
}): Promise<MapsSerpClassifyResult[]> {
  const zoom = defaultZoomForRadius(args.opts.radiusM ?? 1500)

  const out: MapsSerpClassifyResult[] = []
  for (const keyword of args.keywords) {
    try {
      const result = await dataForSeoRequest<DataForSeoMapsResult>('/v3/serp/google/maps/live/advanced', [
        {
          keyword,
          language_code: args.opts.language_code,
          location_coordinate: `${args.opts.centerLat},${args.opts.centerLng},${zoom}z`,
          device: 'mobile',
          depth: 20,
          search_places: false,
        },
      ])

      const items = result.items ?? []
      const hasLocalPack = items.some((i) => i.type === 'maps_search' || i.type === 'maps' || i.type === 'local_pack')
      out.push({
        keyword,
        class: hasLocalPack ? 'grid' : isGeoKeyword(keyword) ? 'landing' : 'landing',
        hasLocalPack,
        reason: 'maps_serp',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const unsupported =
        /not found|not allowed|unauthorized|unknown|invalid field/i.test(msg) ||
        /DataForSEO:\s*(4\d{4}|5\d{4})/i.test(msg)
      out.push({
        keyword,
        class: isGeoKeyword(keyword) ? 'grid' : 'landing',
        hasLocalPack: isGeoKeyword(keyword),
        reason: unsupported ? 'unsupported' : 'fallback_heuristic',
      })
    }
  }
  return out
}

