import { chunkArray, dataForSeoRequest } from '@/lib/providers/dataforseo/client'

export type KeywordMetrics = {
  keyword: string
  provider: 'clickstream' | 'google_ads'
  search_volume: number | null
  cpc: number | null
  competition: number | null
  monthly: unknown | null
}

type TasksEnvelope<T> = {
  tasks?: Array<{
    status_code?: number
    status_message?: string
    result?: T[]
  }>
}

type GoogleAdsSearchVolumeRow = {
  keyword?: string
  search_volume?: number
  cpc?: number
  competition?: number
  monthly_searches?: unknown
}

type ClickstreamSearchVolumeRow = {
  keyword?: string
  search_volume?: number
  cpc?: number
  competition?: number
  monthly_searches?: unknown
}

export type KeywordEnrichOptions = {
  location_code?: number
  language_code?: string
  batchSize?: number
}

function numOrNull(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function normalizeRow<T extends { keyword?: string; search_volume?: number; cpc?: number; competition?: number; monthly_searches?: unknown }>(
  row: T,
  provider: KeywordMetrics['provider'],
): KeywordMetrics | null {
  const keyword = (row.keyword ?? '').trim()
  if (!keyword) return null
  return {
    keyword,
    provider,
    search_volume: numOrNull(row.search_volume),
    cpc: numOrNull(row.cpc),
    competition: numOrNull(row.competition),
    monthly: row.monthly_searches ?? null,
  }
}

async function tryClickstream(args: { keywords: string[]; location_code: number; language_code: string; batchSize: number }) {
  const metrics: KeywordMetrics[] = []
  const unsupported: { ok: false; reason: string } | null = null

  for (const chunk of chunkArray(args.keywords, args.batchSize)) {
    try {
      // Docs: /v3/keywords_data/clickstream_data/dataforseo_search_volume/live
      // Payload is task array.
      const res = await dataForSeoRequest<TasksEnvelope<{ items?: ClickstreamSearchVolumeRow[] }>>(
        '/v3/keywords_data/clickstream_data/dataforseo_search_volume/live',
        [
          {
            language_code: args.language_code,
            keywords: chunk,
          },
        ],
      )

      // dataForSeoRequest returns tasks[0].result[0] already. For keywords APIs, that object usually has items[].
      const items = (res as unknown as { items?: ClickstreamSearchVolumeRow[] }).items ?? []
      for (const row of items) {
        const m = normalizeRow(row, 'clickstream')
        if (m) metrics.push(m)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Capability detection: basic accounts often error on unsupported endpoints.
      if (
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('unknown') ||
        msg.toLowerCase().includes('not allowed') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('payment required') ||
        msg.toLowerCase().includes('invalid field')
      ) {
        return { ok: false as const, reason: msg }
      }
      throw e
    }
  }

  return { ok: true as const, metrics, unsupported }
}

async function googleAds(args: { keywords: string[]; location_code: number; language_code: string; batchSize: number }) {
  const metrics: KeywordMetrics[] = []

  for (const chunk of chunkArray(args.keywords, args.batchSize)) {
    let res: unknown
    try {
      res = await dataForSeoRequest<TasksEnvelope<{ items?: GoogleAdsSearchVolumeRow[] }>>(
        '/v3/keywords_data/google_ads/search_volume/live',
        [
          {
            language_code: args.language_code,
            keywords: chunk,
          },
        ],
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const unsupported =
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('unknown') ||
        msg.toLowerCase().includes('not allowed') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('payment required') ||
        msg.toLowerCase().includes('invalid field')
      if (unsupported) {
        // Graceful degradation: allow pipeline to continue with null metrics.
        return { ok: false as const, reason: msg, metrics: [] as KeywordMetrics[] }
      }
      throw e
    }

    const items = (res as unknown as { items?: GoogleAdsSearchVolumeRow[] }).items ?? []
    for (const row of items) {
      const m = normalizeRow(row, 'google_ads')
      if (m) metrics.push(m)
    }
  }

  return { ok: true as const, metrics }
}

export async function enrichKeywordsWithDataForSEO(args: { keywords: string[]; opts?: KeywordEnrichOptions }) {
  // Romania defaults
  const location_code = args.opts?.location_code
  const language_code = args.opts?.language_code ?? 'ro'
  const batchSize = Math.min(500, Math.max(10, args.opts?.batchSize ?? 200))

  // Try clickstream first; fall back to google_ads
  const cs = await tryClickstream({ keywords: args.keywords, location_code: location_code ?? 0, language_code, batchSize })
  if (cs.ok) {
    return { provider: 'clickstream' as const, metrics: cs.metrics, clickstreamSupported: true }
  }

  // If no explicit location_code was provided, omit it for worldwide fallback (still useful in RO market for relative ranking).
  const gaPayloadLocationCode = location_code ?? 0
  const ga = await googleAds({ keywords: args.keywords, location_code: gaPayloadLocationCode, language_code, batchSize })
  if (ga.ok) {
    return { provider: 'google_ads' as const, metrics: ga.metrics, clickstreamSupported: false, clickstreamError: cs.reason }
  }

  return {
    provider: 'google_ads' as const,
    metrics: [],
    clickstreamSupported: false,
    clickstreamError: [cs.reason, ga.reason].filter(Boolean).join(' | '),
  }
}

