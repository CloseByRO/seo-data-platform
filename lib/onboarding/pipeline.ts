import { createAdminClient } from '@/lib/supabase/admin'
import { onboardingIntakeSchema } from '@/lib/validation/onboarding-intake'
import { buildKeywordIntelligence } from '@/lib/seo/keyword-intelligence'
import { toSlugFromName } from '@/lib/onboarding/slug'
import { buildToonFromIntake } from '@/lib/onboarding/toon'
import { generateWebsiteLlmPayload } from '@/lib/onboarding/website-llm'
import { mergeLlmIntoSeed } from '@/lib/onboarding/website-merge'
import referenceSeed from '@/lib/onboarding/reference-client.seed.json'

export type OnboardingRunResult =
  | { ok: true; intakeId: string; status: 'done'; artifacts: Record<string, unknown> }
  | { ok: false; intakeId: string; status: 'failed'; error: string }

function nowIso() {
  return new Date().toISOString()
}

function computeBackoffMinutes(attempts: number) {
  // 0->2m, 1->5m, 2->15m, 3->60m, 4->360m, 5+->1440m
  if (attempts <= 0) return 2
  if (attempts === 1) return 5
  if (attempts === 2) return 15
  if (attempts === 3) return 60
  if (attempts === 4) return 360
  return 1440
}

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000)
}

type IntakeRow = {
  id: string
  org_id: string
  status: string
  payload: unknown
  attempts?: number | null
  artifacts?: unknown
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export async function runOnboardingPipelineForIntake(args: {
  intakeId: string
  // Optional safety: if passed, must match row org_id.
  orgId?: string
  dryRun?: boolean
}): Promise<OnboardingRunResult> {
  const supabase = createAdminClient()

  const { data: row, error: loadErr } = await supabase
    .from('onboarding_intakes')
    .select('id, org_id, status, payload, attempts, artifacts')
    .eq('id', args.intakeId)
    .maybeSingle()

  if (loadErr) {
    return { ok: false, intakeId: args.intakeId, status: 'failed', error: loadErr.message }
  }
  if (!row) {
    return { ok: false, intakeId: args.intakeId, status: 'failed', error: 'Intake not found' }
  }
  const intake = row as IntakeRow
  if (args.orgId && intake.org_id !== args.orgId) {
    return { ok: false, intakeId: args.intakeId, status: 'failed', error: 'orgId mismatch' }
  }

  // Idempotent: if already done, return stored artifacts.
  if (intake.status === 'done') {
    return {
      ok: true,
      intakeId: intake.id,
      status: 'done',
      artifacts: safeObj(intake.artifacts),
    }
  }

  const prevArtifacts = safeObj(intake.artifacts)
  const attempts = Math.max(0, Number(intake.attempts ?? 0))

  // Mark processing and bump attempts (best-effort).
  await supabase
    .from('onboarding_intakes')
    .update({
      status: 'processing',
      attempts: attempts + 1,
      next_retry_at: null,
      last_error: null,
      artifacts: {
        ...prevArtifacts,
        pipeline: {
          ...(safeObj(prevArtifacts.pipeline) as Record<string, unknown>),
          updatedAt: nowIso(),
          startedAt: (safeObj(prevArtifacts.pipeline).startedAt as string | undefined) ?? nowIso(),
        },
      },
    })
    .eq('id', intake.id)

  try {
    const parsed = onboardingIntakeSchema.safeParse(intake.payload)
    if (!parsed.success) {
      await supabase
        .from('onboarding_intakes')
        .update({
          status: 'failed',
          validation_errors: parsed.error.flatten(),
          last_error: 'Validation failed',
        })
        .eq('id', intake.id)

      return { ok: false, intakeId: intake.id, status: 'failed', error: 'Validation failed' }
    }

    const payload = parsed.data
    const locality = payload.location.locality ?? null
    const county = payload.location.county ?? null
    const sector = payload.location.sector ?? null
    const neighborhood = payload.location.neighborhood ?? null

    const keywordIntel =
      prevArtifacts.keywordIntel ??
      (await buildKeywordIntelligence({
        orgId: payload.orgId,
        locality,
        county,
        seedKeywords: payload.keywords?.seedKeywords ?? [],
        services: payload.services.map((s) => s.name),
        specialties: payload.specialties,
        targetCount: 40,
        center: {
          lat: payload.location.lat,
          lng: payload.location.lng,
          radiusM: 2000,
        },
        geoFocus: { sector, neighborhood },
      }))

    const toon =
      (prevArtifacts.toon as Record<string, unknown> | undefined) ??
      buildToonFromIntake(payload, {
        seoKeywordCandidates: Array.isArray((keywordIntel as any)?.final)
          ? (keywordIntel as any).final.slice(0, 24).map((k: string) => ({ keyword: k }))
          : undefined,
      })

    let websiteConfig: Record<string, unknown> | undefined
    let llmPayload: Record<string, unknown> | undefined

    if (payload.website.wantsWebsite) {
      const baseSeed = structuredClone(referenceSeed) as Record<string, unknown>
      baseSeed.slug = toSlugFromName(payload.client.displayName)
      baseSeed.name = payload.client.displayName
      baseSeed.shortName = payload.client.displayName
      baseSeed.email = payload.client.email
      baseSeed.phone = payload.client.phone
      baseSeed.address = {
        ...(safeObj(baseSeed.address) as Record<string, unknown>),
        city: payload.location.locality ?? '—',
        sector: payload.location.sector ?? undefined,
        lat: payload.location.lat,
        lng: payload.location.lng,
        mapsEmbedUrl: '',
        nearbyTransport: payload.websiteContent.nearbyTransport ?? [],
        parking: payload.websiteContent.parkingNotes ?? '',
      }
      baseSeed.openingHours = payload.availability.openingHours
      baseSeed.onboarding = {
        optInWebsite: true,
        optInCal: Boolean(payload.automation.useCalcom),
      }
      baseSeed.services = payload.services.map((s, idx) => ({
        id: `s${idx}`,
        title: s.name,
        description: '',
        duration: s.durationMinutes,
        price: s.priceRon,
        currency: 'RON',
        calEventSlug:
          payload.calcom.serviceEventSlugs?.find((x) => x.serviceName === s.name)?.eventSlug ??
          s.slug,
      }))
      baseSeed.faqs = payload.websiteContent.faqs ?? []

      if (!args.dryRun) {
        const llm = await generateWebsiteLlmPayload({ toon })
        llmPayload = llm.payload
      }

      if (llmPayload) {
        websiteConfig = mergeLlmIntoSeed(baseSeed, llmPayload)
      } else {
        // If LLM step is skipped (dry run), persist a seed-only config.
        websiteConfig = baseSeed
      }
    }

    const nextArtifacts = {
      ...prevArtifacts,
      pipeline: {
        ...(safeObj(prevArtifacts.pipeline) as Record<string, unknown>),
        updatedAt: nowIso(),
        completedAt: nowIso(),
      },
      keywordIntel,
      toon,
      ...(llmPayload ? { websiteLlmPayload: llmPayload } : {}),
      ...(websiteConfig ? { websiteConfig } : {}),
    }

    await supabase
      .from('onboarding_intakes')
      .update({
        status: 'done',
        artifacts: nextArtifacts,
        last_error: null,
        next_retry_at: null,
      })
      .eq('id', intake.id)

    return { ok: true, intakeId: intake.id, status: 'done', artifacts: nextArtifacts }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const retryAt = addMinutes(new Date(), computeBackoffMinutes(attempts + 1))
    await supabase
      .from('onboarding_intakes')
      .update({
        status: 'failed',
        last_error: msg,
        next_retry_at: retryAt.toISOString(),
        artifacts: {
          ...prevArtifacts,
          pipeline: {
            ...(safeObj(prevArtifacts.pipeline) as Record<string, unknown>),
            updatedAt: nowIso(),
            lastFailedAt: nowIso(),
          },
        },
      })
      .eq('id', intake.id)

    return { ok: false, intakeId: intake.id, status: 'failed', error: msg }
  }
}

