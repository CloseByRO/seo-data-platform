import { chunkArray, dataForSeoRequest } from '@/lib/providers/dataforseo/client'

export type SerpIntentClass = 'grid' | 'landing' | 'content'

export type SerpClassifyResult = {
  keyword: string
  hasLocalPack: boolean
  class: SerpIntentClass
  reason: {
    localPackDetected?: boolean
    commercialTerms?: boolean
    informationalTerms?: boolean
    itemTypes?: string[]
  }
}

type OrganicItem = { type?: string }

type OrganicSerpResult = {
  item_types?: string[]
  items?: OrganicItem[]
}

export type OrganicSerpOptions = {
  location_code?: number
  language_code?: string
  batchSize?: number
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

function keywordHeuristics(keyword: string) {
  const k = norm(keyword)
  const commercial = /\b(pret|tarif|cost|programare|rezervare)\b/.test(k)
  const informational = /\b(cum|ce este|ce inseamna|simptome|tratament|ghid)\b/.test(k)
  return { commercial, informational }
}

function hasLocalPackFromTypes(types: string[]) {
  const t = types.map((x) => x.toLowerCase())
  return t.includes('local_pack') || t.includes('map') || t.includes('maps') || t.includes('local_finder')
}

export async function classifyKeywordsByOrganicSerp(args: { keywords: string[]; opts?: OrganicSerpOptions }) {
  const location_code = args.opts?.location_code
  const language_code = args.opts?.language_code ?? 'ro'
  const batchSize = Math.min(100, Math.max(10, args.opts?.batchSize ?? 50))

  const out: SerpClassifyResult[] = []

  for (const chunk of chunkArray(args.keywords, batchSize)) {
    // Organic endpoint accepts one task at a time; we can still send multiple tasks in one payload.
    // However our client returns result[0] only, so we do 1 keyword per request here for correctness.
    // (We can upgrade client later to return full tasks[] when needed.)
    for (const kw of chunk) {
      const task: Record<string, unknown> = {
        keyword: kw,
        language_code,
        device: 'mobile',
        depth: 20,
      }
      if (typeof location_code === 'number' && Number.isFinite(location_code)) task.location_code = location_code

      let res: OrganicSerpResult | null = null
      try {
        res = await dataForSeoRequest<OrganicSerpResult>('/v3/serp/google/organic/live/advanced', [task])
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const unsupported =
          msg.toLowerCase().includes('not found') ||
          msg.toLowerCase().includes('unknown') ||
          msg.toLowerCase().includes('not allowed') ||
          msg.toLowerCase().includes('unauthorized') ||
          msg.toLowerCase().includes('invalid field')
        if (unsupported) {
          const { commercial, informational } = keywordHeuristics(kw)
          const klass: SerpIntentClass = commercial ? 'landing' : informational ? 'content' : 'landing'
          out.push({
            keyword: kw,
            hasLocalPack: false,
            class: klass,
            reason: { localPackDetected: false, commercialTerms: commercial, informationalTerms: informational, itemTypes: [] },
          })
          continue
        }
        throw e
      }

      const itemTypes = res?.item_types ?? []
      const hasLocalPack = hasLocalPackFromTypes(itemTypes)
      const { commercial, informational } = keywordHeuristics(kw)

      let klass: SerpIntentClass
      if (hasLocalPack) klass = 'grid'
      else if (commercial) klass = 'landing'
      else if (informational) klass = 'content'
      else klass = 'landing'

      out.push({
        keyword: kw,
        hasLocalPack,
        class: klass,
        reason: {
          localPackDetected: hasLocalPack,
          commercialTerms: commercial,
          informationalTerms: informational,
          itemTypes: itemTypes.slice(0, 30),
        },
      })
    }
  }

  return out
}

