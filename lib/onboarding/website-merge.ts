import type { LlmClientPayload } from '@/lib/onboarding/website-schema'

const META_TITLE_TARGET = 60
const META_DESC_TARGET = 155
const META_TITLE_HARD = 70
const META_DESC_HARD = 200

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function normIncludes(hay: string, needle: string) {
  if (!needle) return true
  return norm(hay).includes(norm(needle))
}

function softTruncate(s: string, max: number) {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

function dedupeKeywords(arr: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of arr) {
    const key = k.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(k.trim())
  }
  return out
}

function applySeoLayer(seo: LlmClientPayload['seo']) {
  const metaTitle = softTruncate(seo.metaTitle, META_TITLE_TARGET)
  const metaDescription = softTruncate(seo.metaDescription, META_DESC_TARGET)
  const keywords = dedupeKeywords(seo.keywords).slice(0, 24)
  return { ...seo, metaTitle, metaDescription, keywords }
}

function alignSeoWithSeed(seed: Record<string, any>, seo: LlmClientPayload['seo']) {
  const brand = String(seed.shortName || seed.name || '').trim()
  const city = String(seed.address?.city || '').trim()
  let metaTitle = seo.metaTitle
  let metaDescription = seo.metaDescription
  let keywords = [...seo.keywords]

  if (brand && !normIncludes(metaTitle, brand)) {
    metaTitle = softTruncate(`${brand} | ${metaTitle}`, META_TITLE_HARD)
  }
  if (brand && !normIncludes(metaDescription, brand)) {
    metaDescription = softTruncate(`${metaDescription} ${brand}.`, META_DESC_HARD)
  }
  if (brand && city && !keywords.some((k) => normIncludes(k, brand))) {
    keywords = dedupeKeywords([`${brand} ${city}`.toLowerCase(), ...keywords]).slice(0, 24)
  }

  return { ...seo, metaTitle, metaDescription, keywords }
}

/**
 * Merge validated LLM payload into seed ClientConfig JSON.
 * Overwrites: layout, seo, content, faqs only.
 */
export function mergeLlmIntoSeed(seed: Record<string, any>, payload: LlmClientPayload) {
  const out = structuredClone(seed)
  out.layout = { ...(out.layout ?? {}), ...payload.layout }
  let seoMerged = applySeoLayer(payload.seo)
  seoMerged = alignSeoWithSeed(seed, seoMerged)
  out.seo = { ...(out.seo ?? {}), ...seoMerged }
  out.content = { ...(out.content ?? {}), ...payload.content }
  out.faqs = payload.faqs
  return out as Record<string, unknown>
}

