/**
 * Real-run smoke tester for the keyword intelligence pipeline.
 *
 * Usage:
 *   node --env-file=.env.local scripting/dataforseo/run-keyword-intel-smoke.mjs
 *
 * Notes:
 * - Requires DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD in .env.local
 * - Uses fixtures in tests/fixtures/onboarding-intake-scenarios/
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(json)}`)
  return json
}

function loadFixture(name) {
  const p = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'onboarding-intake-scenarios', name)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function toInput(fx) {
  return {
    orgId: fx.orgId,
    locality: fx.location.locality,
    county: fx.location.county,
    seedKeywords: fx.keywords.seedKeywords,
    services: (fx.services || []).map((s) => s.name),
    specialties: fx.specialties || [],
    targetCount: 35,
    dryRun: true,
  }
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const fixtures = [
  'bucharest_sector3_full.json',
  'cluj_no_website_cal_only.json',
  'mioveni_small_locality_basic.json',
]

for (const f of fixtures) {
  const fx = loadFixture(f)
  const body = toInput(fx)
  console.log('\n===', f, '===')
  console.log('locality:', body.locality, 'county:', body.county, 'seed:', body.seedKeywords.length)
  console.log('NOTE: this script calls the API route; you must be signed in in the browser for non-dryRun persistence.')
  const res = await postJson(`${baseUrl}/api/dataforseo/keywords/intel/run`, body)
  console.log('grid:', res.output.gridKeywords.length, 'landing:', res.output.landingKeywords.length, 'content:', res.output.contentKeywords.length)
  console.log('clickstreamSupported:', res.output.debug.clickstreamSupported)
}

