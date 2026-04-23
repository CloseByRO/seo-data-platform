import { dataForSeoRequest } from '@/lib/providers/dataforseo/client'

export type RankedKeyword = {
  keyword: string
  search_volume: number | null
  cpc: number | null
  competition: number | null
  raw: unknown
}

type LabsRankedKeywordsResult = {
  items?: Array<{
    keyword?: string
    search_volume?: number
    cpc?: number
    competition?: number
  }>
}

function numOrNull(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export async function fetchRankedKeywordsFromLabs(args: {
  keyword: string
  location_code?: number
  language_code?: string
  limit?: number
}) {
  const location_code = args.location_code ?? 0
  const language_code = args.language_code ?? 'ro'
  const limit = Math.min(100, Math.max(10, args.limit ?? 50))

  try {
    const res = await dataForSeoRequest<LabsRankedKeywordsResult>('/v3/dataforseo_labs/google/ranked_keywords/live', [
      {
        keyword: args.keyword,
        location_code,
        language_code,
        limit,
      },
    ])

    const items = (res.items ?? []).map((i) => ({
      keyword: (i.keyword ?? '').trim(),
      search_volume: numOrNull(i.search_volume),
      cpc: numOrNull(i.cpc),
      competition: numOrNull(i.competition),
      raw: i,
    }))

    return { ok: true as const, items: items.filter((x) => x.keyword) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const unsupported =
      msg.toLowerCase().includes('not found') ||
      msg.toLowerCase().includes('unknown') ||
      msg.toLowerCase().includes('not allowed') ||
      msg.toLowerCase().includes('unauthorized') ||
      msg.toLowerCase().includes('payment required') ||
      msg.toLowerCase().includes('unusual activity') ||
      msg.toLowerCase().includes('dataforseo: 40201') ||
      // Basic plans / mismatched payload requirements often show up as “Invalid Field”.
      msg.toLowerCase().includes('invalid field')
    if (unsupported) return { ok: false as const, reason: msg }
    throw e
  }
}

