import { stripDiacritics } from '@/lib/romania/counties'
import { expandSeedKeywordsForPsychologistGrid, type KeywordCandidate, type KeywordExpansionInput } from '@/lib/seo/keyword-expansion'
import { enrichKeywordsWithDataForSEO, type KeywordMetrics } from '@/lib/providers/dataforseo/keywords-data'
import { classifyKeywordsByMapsSerp, type MapsSerpClassifyResult } from '@/lib/providers/dataforseo/serp-maps'
import { fetchRankedKeywordsFromLabs } from '@/lib/providers/dataforseo/labs'

export type KeywordIntelInput = KeywordExpansionInput & {
  orgId: string
  clientId?: string | null
  locationId?: string | null
  center?: { lat: number; lng: number; radiusM?: number } | null
  // for Labs seed queries
  bigCityQueryHint?: string | null
}

export type EnrichedKeyword = {
  keyword: string
  keywordNorm: string
  variants: string[]
  sources: KeywordCandidate['source']
  metrics: {
    provider: 'clickstream' | 'google_ads' | 'none'
    searchVolume: number | null
    cpc: number | null
    competition: number | null
  }
  intent: {
    class: 'grid' | 'landing' | 'content'
    hasLocalPack: boolean
    reason: MapsSerpClassifyResult['reason'] | null
  }
  score: number
}

export type KeywordIntelOutput = {
  gridKeywords: string[]
  landingKeywords: string[]
  contentKeywords: string[]
  debug: {
    clickstreamSupported: boolean
    clickstreamError?: string
    generatedCount: number
    dedupedCount: number
    enrichedCount: number
    classifiedCount: number
    enriched: EnrichedKeyword[]
    dropped: Array<{ keyword: string; reason: string }>
    competitor: { attempted: boolean; ok: boolean; reason?: string; addedCount: number }
  }
}

function normalizeSpaces(s: string) {
  return s.trim().replace(/\s+/g, ' ')
}

function keywordNorm(s: string) {
  return stripDiacritics(normalizeSpaces(s).toLowerCase())
}

function numOrNull(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function log1p(x: number) {
  return Math.log(1 + Math.max(0, x))
}

function isCommercialKeyword(k: string) {
  const n = keywordNorm(k)
  return /\b(pret|tarif|cost|programare|rezervare)\b/.test(n)
}

function isInformationalKeyword(k: string) {
  const n = keywordNorm(k)
  return /\b(cum|ce este|ce inseamna|simptome|tratament|ghid)\b/.test(n)
}

function geoBonus(keyword: string) {
  const n = keywordNorm(keyword)
  if (/\bsector\s+[1-6]\b/.test(n)) return 2
  // neighborhood signals (lightweight; this list already exists in generator, but we keep scoring simple here)
  if (/\b(titan|dristor|vitan|militari|manastur|marasti|zorilor|copou|tatarasi)\b/.test(n)) return 2
  return 0
}

function intentBonus(keyword: string) {
  const n = keywordNorm(keyword)
  if (/\b(pret|tarif|cost|programare|rezervare)\b/.test(n)) return 2
  return 0
}

function computeScore(args: {
  keyword: string
  searchVolume: number | null
  cpc: number | null
  intentClass: 'grid' | 'landing' | 'content'
}) {
  const vol = args.searchVolume ?? 0
  const cpc = args.cpc ?? 0
  const klassBonus = args.intentClass === 'grid' ? 1.5 : args.intentClass === 'landing' ? 1 : 0.5
  return 2 * log1p(vol) + 2 * cpc + intentBonus(args.keyword) + geoBonus(args.keyword) + klassBonus
}

function quotaPick(args: {
  enriched: EnrichedKeyword[]
  targetCount: number
  buckets: { head: (k: string) => boolean; service: (k: string) => boolean; geo: (k: string) => boolean; specialty: (k: string) => boolean }
}) {
  const max = Math.min(40, Math.max(20, args.targetCount))
  const headTarget = Math.max(2, Math.round(max * 0.1))
  const serviceTarget = Math.max(10, Math.round(max * 0.5))
  const geoTarget = Math.max(5, Math.round(max * 0.25))
  const specialtyTarget = Math.max(3, Math.round(max * 0.15))

  const sorted = [...args.enriched].sort((a, b) => b.score - a.score)
  const picked: EnrichedKeyword[] = []
  const pickedNorm = new Set<string>()

  function pick(filter: (k: EnrichedKeyword) => boolean, limit: number) {
    for (const e of sorted) {
      if (picked.length >= max) break
      if (picked.length >= limit) break
      if (pickedNorm.has(e.keywordNorm)) continue
      if (!filter(e)) continue
      picked.push(e)
      pickedNorm.add(e.keywordNorm)
    }
  }

  pick((e) => args.buckets.head(e.keyword), headTarget)
  pick((e) => args.buckets.service(e.keyword), headTarget + serviceTarget)
  pick((e) => args.buckets.geo(e.keyword), headTarget + serviceTarget + geoTarget)
  pick((e) => args.buckets.specialty(e.keyword), headTarget + serviceTarget + geoTarget + specialtyTarget)

  for (const e of sorted) {
    if (picked.length >= max) break
    if (pickedNorm.has(e.keywordNorm)) continue
    picked.push(e)
    pickedNorm.add(e.keywordNorm)
  }

  return picked.slice(0, max)
}

export async function buildKeywordIntelligence(input: KeywordIntelInput): Promise<KeywordIntelOutput> {
  // Step 1: generate
  const generated = expandSeedKeywordsForPsychologistGrid({
    locality: input.locality,
    county: input.county,
    geoFocus: input.geoFocus,
    seedKeywords: input.seedKeywords,
    services: input.services,
    specialties: input.specialties,
    targetCount: Math.max(50, Math.min(300, input.targetCount * 6)),
  })

  const generatedList = generated.final

  // Step 2: normalize + variants
  const variantsByNorm = new Map<string, { canonical: string; variants: Set<string>; sources: KeywordCandidate['source'] }>()
  const dropped: Array<{ keyword: string; reason: string }> = []

  for (const kw of generatedList) {
    const k = normalizeSpaces(kw)
    if (!k) continue
    const norm = keywordNorm(k)
    const entry = variantsByNorm.get(norm)
    if (!entry) {
      variantsByNorm.set(norm, { canonical: k, variants: new Set([k]), sources: [] })
    } else {
      entry.variants.add(k)
    }
  }

  // Prefer canonical with diacritics if it exists among variants (simple heuristic: the one with more non-ascii)
  for (const [norm, entry] of variantsByNorm) {
    const all = [...entry.variants]
    all.sort((a, b) => {
      const aScore = a.replace(/[\\x00-\\x7F]/g, '').length
      const bScore = b.replace(/[\\x00-\\x7F]/g, '').length
      return bScore - aScore
    })
    entry.canonical = all[0] ?? entry.canonical
    variantsByNorm.set(norm, entry)
  }

  const deduped = Array.from(variantsByNorm.entries()).map(([keywordNormKey, v]) => ({
    keyword: v.canonical,
    keywordNorm: keywordNormKey,
    variants: [...v.variants],
    sources: v.sources,
  }))

  // Step 6 (optional early): competitor expansion using Labs (capability-detected)
  let competitorAttempted = false
  let competitorOk = false
  let competitorReason: string | undefined
  let competitorAddedCount = 0

  const seedQuery =
    input.bigCityQueryHint?.trim() ||
    (input.locality ? `psiholog ${input.locality}` : input.county ? `psiholog ${input.county}` : 'psiholog')

  competitorAttempted = true
  const labs = await fetchRankedKeywordsFromLabs({ keyword: seedQuery, language_code: 'ro', location_code: 0, limit: 50 })
  if (labs.ok) {
    competitorOk = true
    for (const item of labs.items) {
      if ((item.search_volume ?? 0) < 20) continue
      const norm = keywordNorm(item.keyword)
      if (variantsByNorm.has(norm)) continue
      variantsByNorm.set(norm, { canonical: item.keyword, variants: new Set([item.keyword]), sources: [] })
      competitorAddedCount++
    }
  } else {
    competitorOk = false
    competitorReason = labs.reason
  }

  const allCandidates = Array.from(variantsByNorm.entries()).map(([kNorm, v]) => ({
    keyword: v.canonical,
    keywordNorm: kNorm,
    variants: [...v.variants],
    sources: v.sources,
  }))

  // Step 3: enrich metrics (clickstream -> fallback to google_ads)
  const enrich = await enrichKeywordsWithDataForSEO({
    keywords: allCandidates.map((c) => c.keyword),
    opts: { language_code: 'ro', location_code: 0, batchSize: 200 },
  })

  const metricsByNorm = new Map<string, KeywordMetrics>()
  for (const m of enrich.metrics) {
    metricsByNorm.set(keywordNorm(m.keyword), m)
  }

  // Step 4: filter
  const enrichedFiltered: Array<{ c: (typeof allCandidates)[number]; m: KeywordMetrics | null }> = []
  for (const c of allCandidates) {
    const m = metricsByNorm.get(c.keywordNorm) ?? null
    const vol = m?.search_volume ?? null
    const cpc = m?.cpc ?? null

    const keep =
      (typeof vol === 'number' && vol >= 10) ||
      (vol === null && (isCommercialKeyword(c.keyword) || geoBonus(c.keyword) > 0)) ||
      (typeof cpc === 'number' && cpc > 0)

    if (!keep) {
      dropped.push({ keyword: c.keyword, reason: 'filtered_low_signal' })
      continue
    }
    enrichedFiltered.push({ c, m })
  }

  // Step 5: SERP classification (subset, cost control) using Maps SERP for local-pack detection
  const topForClassification = [...enrichedFiltered]
    .sort((a, b) => {
      const av = a.m?.search_volume ?? 0
      const bv = b.m?.search_volume ?? 0
      const ac = a.m?.cpc ?? 0
      const bc = b.m?.cpc ?? 0
      return bv - av || bc - ac
    })
    .slice(0, 40)

  const centerLat = input.center?.lat ?? null
  const centerLng = input.center?.lng ?? null
  const serp =
    centerLat != null && centerLng != null
      ? await classifyKeywordsByMapsSerp({
          keywords: topForClassification.map((x) => x.c.keyword),
          opts: { language_code: 'ro', centerLat, centerLng, radiusM: input.center?.radiusM },
        })
      : topForClassification.map((x) => ({
          keyword: x.c.keyword,
          class: geoBonus(x.c.keyword) > 0 ? ('grid' as const) : ('landing' as const),
          hasLocalPack: geoBonus(x.c.keyword) > 0,
          reason: 'fallback_heuristic' as const,
        }))

  const serpByNorm = new Map<string, MapsSerpClassifyResult>()
  for (const s of serp) serpByNorm.set(keywordNorm(s.keyword), s)

  const enriched: EnrichedKeyword[] = enrichedFiltered.map(({ c, m }) => {
    const klass =
      serpByNorm.get(c.keywordNorm)?.class ??
      (isInformationalKeyword(c.keyword) ? 'content' : isCommercialKeyword(c.keyword) ? 'landing' : 'landing')

    const score = computeScore({
      keyword: c.keyword,
      searchVolume: numOrNull(m?.search_volume),
      cpc: numOrNull(m?.cpc),
      intentClass: klass,
    })

    return {
      keyword: c.keyword,
      keywordNorm: c.keywordNorm,
      variants: c.variants,
      sources: c.sources,
      metrics: {
        provider: m?.provider ?? 'none',
        searchVolume: numOrNull(m?.search_volume),
        cpc: numOrNull(m?.cpc),
        competition: numOrNull(m?.competition),
      },
      intent: {
        class: klass,
        hasLocalPack: serpByNorm.get(c.keywordNorm)?.hasLocalPack ?? false,
        reason: serpByNorm.get(c.keywordNorm)?.reason ?? null,
      },
      score,
    }
  })

  // Step 8: selection with quotas
  const servicesUsed = input.services.map((s) => keywordNorm(s)).filter(Boolean)
  const specialtiesUsed = input.specialties.map((s) => keywordNorm(s)).filter(Boolean)
  const geoTokens = [input.locality ?? '', input.county ?? ''].map(keywordNorm).filter(Boolean)

  const buckets = {
    head: (k: string) => {
      const n = keywordNorm(k)
      return n === 'psiholog' || n === 'psihoterapeut' || n === 'cabinet psihologie' || n === 'terapie'
    },
    service: (k: string) => servicesUsed.some((t) => t && keywordNorm(k).includes(t)),
    geo: (k: string) => geoBonus(k) > 0 || geoTokens.some((t) => t && keywordNorm(k).includes(t)),
    specialty: (k: string) => specialtiesUsed.some((t) => t && keywordNorm(k).includes(t)),
  }

  const picked = quotaPick({ enriched, targetCount: input.targetCount, buckets })

  const gridKeywords = picked.filter((x) => x.intent.class === 'grid').map((x) => x.keyword)
  const landingKeywords = picked.filter((x) => x.intent.class === 'landing').map((x) => x.keyword)
  const contentKeywords = picked.filter((x) => x.intent.class === 'content').map((x) => x.keyword)

  return {
    gridKeywords,
    landingKeywords,
    contentKeywords,
    debug: {
      clickstreamSupported: enrich.clickstreamSupported,
      clickstreamError: (enrich as unknown as { clickstreamError?: string }).clickstreamError,
      generatedCount: generatedList.length,
      dedupedCount: deduped.length,
      enrichedCount: enriched.length,
      classifiedCount: serp.length,
      enriched,
      dropped,
      competitor: { attempted: competitorAttempted, ok: competitorOk, reason: competitorReason, addedCount: competitorAddedCount },
    },
  }
}

