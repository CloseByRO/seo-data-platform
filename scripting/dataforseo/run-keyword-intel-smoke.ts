import fs from 'node:fs'
import path from 'node:path'
import { buildKeywordIntelligence } from '../../lib/seo/keyword-intelligence'

type Fixture = {
  orgId: string
  location: { locality: string; county: string }
  keywords: { seedKeywords: string[] }
  services: Array<{ name: string }>
  specialties?: string[]
}

function loadFixture(rel: string): Fixture {
  const p = path.join(process.cwd(), rel)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function summarize(out: Awaited<ReturnType<typeof buildKeywordIntelligence>>) {
  return {
    grid: out.gridKeywords.length,
    landing: out.landingKeywords.length,
    content: out.contentKeywords.length,
    clickstreamSupported: out.debug.clickstreamSupported,
    competitor: out.debug.competitor,
    generatedCount: out.debug.generatedCount,
    dedupedCount: out.debug.dedupedCount,
    enrichedCount: out.debug.enrichedCount,
    classifiedCount: out.debug.classifiedCount,
    topGrid: out.gridKeywords.slice(0, 8),
    topLanding: out.landingKeywords.slice(0, 8),
    topContent: out.contentKeywords.slice(0, 8),
  }
}

async function runOne(label: string, fixtureRelPath: string) {
  const fx = loadFixture(fixtureRelPath)
  const out = await buildKeywordIntelligence({
    orgId: fx.orgId,
    clientId: null,
    locationId: null,
    locality: fx.location.locality,
    county: fx.location.county,
    seedKeywords: fx.keywords.seedKeywords,
    services: (fx.services ?? []).map((s) => s.name),
    specialties: fx.specialties ?? [],
    targetCount: 35,
  })

  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(summarize(out), null, 2))
}

async function main() {
  const base = 'tests/fixtures/onboarding-intake-scenarios'

  await runOne('Bucharest (fixture)', `${base}/bucharest_sector3_full.json`)
  await runOne('Cluj (fixture)', `${base}/cluj_no_website_cal_only.json`)
  await runOne('Mioveni (fixture)', `${base}/mioveni_small_locality_basic.json`)
  await runOne('Bucharest (your intake)', `${base}/bucharest_lalosu_marina_intake.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

