import { stripDiacritics } from '@/lib/romania/counties'

export type BigCity =
  | 'București'
  | 'Cluj-Napoca'
  | 'Iași'
  | 'Timișoara'
  | 'Craiova'
  | 'Constanța'

export type KeywordExpansionInput = {
  locality?: string | null
  county?: string | null
  geoFocus?: {
    // Optional hyper-local focus (used to avoid scattering across all București sectors/neighborhoods).
    sector?: string | null
    neighborhood?: string | null
  }
  seedKeywords: string[]
  services: string[]
  specialties: string[]
  targetCount: number // 30–50 recommended
}

export type KeywordCandidate = {
  keyword: string
  source: Array<
    | { kind: 'seed' }
    | { kind: 'service'; service: string }
    | { kind: 'specialty'; specialty: string }
    | { kind: 'head' }
    | { kind: 'geo'; geo: string }
    | { kind: 'intent'; intent: 'pret' | 'programare' }
  >
}

export type KeywordExpansionDebug = {
  city: string | null
  isBigCity: boolean
  geoUsed: string[]
  servicesUsed: string[]
  specialtiesUsed: string[]
  dropped: Array<{ keyword: string; reason: 'duplicate' | 'low_score' | 'trim' }>
}

export type KeywordExpansionResult = {
  final: string[]
  debug: KeywordExpansionDebug
}

function normalizeSpaces(s: string) {
  return s.trim().replace(/\s+/g, ' ')
}

function normKey(s: string) {
  return stripDiacritics(normalizeSpaces(s).toLowerCase())
}

function looksNaturalTherapySpecialty(specialty: string) {
  const n = normKey(specialty)
  // avoid weird combos like "terapie adhd (evaluare...)"
  if (n.includes('adhd')) return false
  if (n.includes('evaluare')) return false
  if (n.includes('consiliere')) return false
  return true
}

function toSlugToken(s: string) {
  return normKey(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const BIG_CITIES: Record<string, BigCity> = {
  bucuresti: 'București',
  'bucurești': 'București',
  cluj: 'Cluj-Napoca',
  'cluj-napoca': 'Cluj-Napoca',
  iasi: 'Iași',
  'iași': 'Iași',
  timisoara: 'Timișoara',
  'timișoara': 'Timișoara',
  craiova: 'Craiova',
  constanta: 'Constanța',
  'constanța': 'Constanța',
}

const BUCHAREST_SECTORS = ['sector 1', 'sector 2', 'sector 3', 'sector 4', 'sector 5', 'sector 6'] as const

const BIG_CITY_NEIGHBORHOODS: Record<BigCity, string[]> = {
  'București': [
    'titan',
    'dristor',
    'vitan',
    'tineretului',
    'militari',
    'drumul taberei',
    'universitate',
    'aviatiei',
  ],
  'Cluj-Napoca': ['manastur', 'marasti', 'zorilor', 'centru'],
  'Iași': ['tatarasi', 'copou', 'centru'],
  'Timișoara': ['complex studentesc', 'circumvalatiunii', 'centru'],
  'Craiova': ['centru'],
  'Constanța': ['tomis', 'centru'],
}

function detectBigCity(locality?: string | null): BigCity | null {
  const loc = (locality ?? '').trim()
  if (!loc) return null
  const key = normKey(loc)
  return BIG_CITIES[key] ?? null
}

function addCandidate(
  map: Map<string, KeywordCandidate>,
  keywordRaw: string,
  source: KeywordCandidate['source'][number],
) {
  const keyword = normalizeSpaces(keywordRaw)
  if (!keyword) return
  const key = normKey(keyword)
  const existing = map.get(key)
  if (existing) {
    existing.source.push(source)
    return
  }
  map.set(key, { keyword, source: [source] })
}

function scoreCandidate(c: KeywordCandidate, opts: { services: string[]; specialties: string[]; geo: string[] }) {
  const k = normKey(c.keyword)
  let score = 0
  const hasPret = k.includes(' pret')
  const hasProgramare = k.includes(' program')

  if (hasPret) score += 1
  if (hasProgramare) score += 1

  const serviceTokens = opts.services.map(toSlugToken).filter(Boolean)
  const specialtyTokens = opts.specialties.map(toSlugToken).filter(Boolean)

  let hasService = false
  let hasSpecialty = false
  let hasGeo = false

  for (const t of serviceTokens) {
    if (t && k.includes(t)) {
      score += 3
      hasService = true
      break
    }
  }
  for (const t of specialtyTokens) {
    if (t && k.includes(t)) {
      score += 2
      hasSpecialty = true
      break
    }
  }
  for (const g of opts.geo.map(normKey)) {
    if (g && k.includes(g)) {
      score += 2
      hasGeo = true
      break
    }
  }

  // Prefer intent+geo combos (these were more stable in real SERP grid runs).
  if (hasGeo && (hasService || hasSpecialty)) score += 2
  if (hasGeo && (hasPret || hasProgramare)) score += 1
  if ((hasService || hasSpecialty) && (hasPret || hasProgramare)) score += 1

  return score
}

function pickWithMix(args: {
  candidates: Array<{ c: KeywordCandidate; score: number }>
  targetCount: number
  buckets: { head: (k: string) => boolean; service: (k: string) => boolean; specialty: (k: string) => boolean }
}) {
  const target = Math.max(5, args.targetCount)
  const max = Math.min(50, target)

  // Reduce head-term share: head queries are high-noise (ads + geo volatility) in big cities.
  const headTarget = Math.max(2, Math.round(max * 0.1))
  const serviceTarget = Math.max(12, Math.round(max * 0.55))
  const specialtyTarget = Math.max(8, Math.round(max * 0.25))

  const picked: string[] = []
  const pickedKeys = new Set<string>()

  const sorted = [...args.candidates].sort((a, b) => b.score - a.score)

  function tryPick(filter: (k: string) => boolean, limit: number) {
    for (const { c } of sorted) {
      if (picked.length >= max) break
      if (picked.length >= limit) break
      const key = normKey(c.keyword)
      if (pickedKeys.has(key)) continue
      if (!filter(c.keyword)) continue
      picked.push(c.keyword)
      pickedKeys.add(key)
    }
  }

  tryPick(args.buckets.head, headTarget)
  tryPick(args.buckets.service, headTarget + serviceTarget)
  tryPick(args.buckets.specialty, headTarget + serviceTarget + specialtyTarget)

  // Fill remaining with best-scoring overall.
  for (const { c } of sorted) {
    if (picked.length >= max) break
    const key = normKey(c.keyword)
    if (pickedKeys.has(key)) continue
    picked.push(c.keyword)
    pickedKeys.add(key)
  }

  return picked.slice(0, max)
}

export function expandSeedKeywordsForPsychologistGrid(input: KeywordExpansionInput): KeywordExpansionResult {
  const city = (input.locality ?? '').trim() || null
  const bigCity = detectBigCity(input.locality)
  const isBigCity = Boolean(bigCity)

  const geo: string[] = []
  if (city) geo.push(city)
  if (!isBigCity && input.county?.trim()) geo.push(input.county.trim())

  const map = new Map<string, KeywordCandidate>()

  // 1) seed keywords first (operator curated)
  for (const kw of input.seedKeywords) addCandidate(map, kw, { kind: 'seed' })

  // 2) service-intent stems
  for (const s of input.services) {
    addCandidate(map, s, { kind: 'service', service: s })
    // small subset gets commercial intent
    if (normKey(s).includes('terapie') || normKey(s).includes('evaluare')) {
      addCandidate(map, `${s} pret`, { kind: 'service', service: s })
    }
  }

  // 3) specialty-problem stems
  for (const sp of input.specialties) {
    addCandidate(map, `psiholog ${sp}`, { kind: 'specialty', specialty: sp })
    if (looksNaturalTherapySpecialty(sp)) addCandidate(map, `terapie ${sp}`, { kind: 'specialty', specialty: sp })
  }

  // 4) head terms
  const headTerms = ['psiholog', 'psihoterapeut', 'cabinet psihologie', 'terapie']
  for (const h of headTerms) addCandidate(map, city ? `${h} ${city}` : h, { kind: 'head' })

  // 4.1) extra county-level heads for small localities (often needed to escape “flat” SERPs)
  if (!isBigCity && input.county?.trim()) {
    const county = input.county.trim()
    addCandidate(map, `psiholog ${county}`, { kind: 'head' })
    addCandidate(map, `psihoterapeut ${county}`, { kind: 'head' })
    addCandidate(map, `cabinet psihologie ${county}`, { kind: 'head' })
  }

  // 5) geo modifiers
  if (isBigCity && bigCity) {
    if (bigCity === 'București') {
      const focusSectorRaw = input.geoFocus?.sector?.trim() ?? null
      const focusSector = focusSectorRaw ? normKey(focusSectorRaw) : null
      if (focusSector && /sector\s+[1-6]/.test(focusSector)) {
        geo.push(focusSector)
      } else {
        for (const sec of BUCHAREST_SECTORS) geo.push(sec)
      }
    }
    const focusNeighborhoodRaw = input.geoFocus?.neighborhood?.trim() ?? null
    if (focusNeighborhoodRaw) geo.push(focusNeighborhoodRaw)
    else for (const n of BIG_CITY_NEIGHBORHOODS[bigCity] ?? []) geo.push(n)
  }

  const baseKeywords = Array.from(map.values()).map((x) => x.keyword)

  for (const kw of baseKeywords) {
    for (const g of geo) {
      // don't double-append if already contains it
      if (normKey(kw).includes(normKey(g))) continue
      addCandidate(map, `${kw} ${g}`, { kind: 'geo', geo: g })
    }
  }

  // 6) small-locality explicit intent patterns (helps avoid 1-result SERPs)
  if (!isBigCity && input.county?.trim()) {
    const county = input.county.trim()
    addCandidate(map, `psiholog ${county} pret`, { kind: 'intent', intent: 'pret' })
    addCandidate(map, `psiholog ${county} programare`, { kind: 'intent', intent: 'programare' })
  }

  const servicesUsed = input.services.filter((s) => s.trim())
  const specialtiesUsed = input.specialties.filter((s) => s.trim())

  const scored = Array.from(map.values()).map((c) => ({
    c,
    score: scoreCandidate(c, { services: servicesUsed, specialties: specialtiesUsed, geo }),
  }))

  const buckets = {
    head: (k: string) => headTerms.some((h) => normKey(k).startsWith(normKey(h))),
    service: (k: string) => servicesUsed.some((s) => normKey(k).includes(toSlugToken(s))),
    specialty: (k: string) => specialtiesUsed.some((s) => normKey(k).includes(toSlugToken(s))),
  }

  const final = pickWithMix({ candidates: scored, targetCount: input.targetCount, buckets })

  const finalKeys = new Set(final.map(normKey))
  const dropped: KeywordExpansionDebug['dropped'] = []
  for (const { c } of scored) {
    if (!finalKeys.has(normKey(c.keyword))) dropped.push({ keyword: c.keyword, reason: 'trim' })
  }

  return {
    final,
    debug: {
      city,
      isBigCity,
      geoUsed: geo,
      servicesUsed,
      specialtiesUsed,
      dropped: dropped.slice(0, 150),
    },
  }
}

export type GridSpec = { radius_m: number; size: 5; step_m: number }

export function defaultGridSpecForLocality(args: { locality?: string | null; radiusOverride?: number }): GridSpec {
  const bigCity = detectBigCity(args.locality)
  const radius = args.radiusOverride ?? (bigCity ? 2000 : 4000)
  const size = 5 as const
  const step = Math.round((2 * radius) / (size - 1))
  return { radius_m: radius, size, step_m: step }
}

