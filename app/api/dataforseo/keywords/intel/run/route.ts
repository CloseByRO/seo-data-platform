import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { buildKeywordIntelligence } from '@/lib/seo/keyword-intelligence'

const bodySchema = z.object({
  orgId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),

  locality: z.string().trim().min(1).max(200),
  county: z.string().trim().min(1).max(200),
  center: z
    .object({
      lat: z.number().finite(),
      lng: z.number().finite(),
      radiusM: z.number().int().min(100).max(10_000).optional(),
    })
    .optional(),

  seedKeywords: z.array(z.string().trim().min(2).max(200)).min(1).max(200),
  services: z.array(z.string().trim().min(2).max(200)).min(1).max(200),
  specialties: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  geoFocus: z
    .object({
      sector: z.string().trim().max(50).optional(),
      neighborhood: z.string().trim().max(120).optional(),
    })
    .optional(),

  targetCount: z.number().int().min(20).max(50).default(35),
  dryRun: z.boolean().default(false),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const body = parsed.data
  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const output = await buildKeywordIntelligence({
    orgId: body.orgId,
    clientId: body.clientId ?? null,
    locationId: body.locationId ?? null,
    locality: body.locality,
    county: body.county,
    geoFocus: body.geoFocus,
    seedKeywords: body.seedKeywords,
    services: body.services,
    specialties: body.specialties,
    targetCount: body.targetCount,
    center: body.center ?? null,
  })

  if (body.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, output })
  }

  // Persist: run record + candidates/metrics/classifications/competitors in bulk.
  const input_payload = {
    locality: body.locality,
    county: body.county,
    seedKeywords: body.seedKeywords,
    services: body.services,
    specialties: body.specialties,
    targetCount: body.targetCount,
  }

  const { data: run, error: runErr } = await supabase
    .from('keyword_intel_runs')
    .insert({
      org_id: body.orgId,
      created_by: user.id,
      client_id: body.clientId ?? null,
      location_id: body.locationId ?? null,
      status: 'running',
      input_payload,
      output_summary: {
        gridCount: output.gridKeywords.length,
        landingCount: output.landingKeywords.length,
        contentCount: output.contentKeywords.length,
      },
    })
    .select('id')
    .single()

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 400 })

  const runId = run.id as string

  const candidatesRows = output.debug.enriched.map((e) => ({
    run_id: runId,
    org_id: body.orgId,
    keyword: e.keyword,
    keyword_norm: e.keywordNorm,
    variants: e.variants,
    sources: e.sources,
    geo_tokens: null,
    intent_hints: null,
  }))

  const metricsRows = output.debug.enriched.map((e) => ({
    run_id: runId,
    org_id: body.orgId,
    keyword: e.keyword,
    keyword_norm: e.keywordNorm,
    provider: e.metrics.provider,
    search_volume: e.metrics.searchVolume,
    cpc: e.metrics.cpc,
    competition: e.metrics.competition,
    monthly: null,
  }))

  const classRows = output.debug.enriched.map((e) => ({
    run_id: runId,
    org_id: body.orgId,
    keyword: e.keyword,
    keyword_norm: e.keywordNorm,
    class: e.intent.class,
    reason: e.intent.reason,
  }))

  const { error: candErr } = await supabase.from('keyword_intel_candidates').insert(candidatesRows)
  if (candErr) {
    await supabase.from('keyword_intel_runs').update({ status: 'failed', error: candErr.message }).eq('id', runId)
    return NextResponse.json({ error: candErr.message }, { status: 400 })
  }

  const { error: metErr } = await supabase.from('keyword_intel_metrics').insert(metricsRows)
  if (metErr) {
    await supabase.from('keyword_intel_runs').update({ status: 'failed', error: metErr.message }).eq('id', runId)
    return NextResponse.json({ error: metErr.message }, { status: 400 })
  }

  const { error: clsErr } = await supabase.from('keyword_intel_classifications').insert(classRows)
  if (clsErr) {
    await supabase.from('keyword_intel_runs').update({ status: 'failed', error: clsErr.message }).eq('id', runId)
    return NextResponse.json({ error: clsErr.message }, { status: 400 })
  }

  const { error: finishErr } = await supabase
    .from('keyword_intel_runs')
    .update({ status: 'success', error: null })
    .eq('id', runId)

  if (finishErr) return NextResponse.json({ error: finishErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, runId, output })
}

