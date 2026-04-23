import type { z } from 'zod'
import { onboardingIntakeSchema } from '@/lib/validation/onboarding-intake'

type Intake = z.infer<typeof onboardingIntakeSchema>

function formatHours(hours: Intake['availability']['openingHours']) {
  // Keep it simple; the LLM mostly uses this as a hint.
  const row = hours?.[0]
  if (!row) return undefined
  const days = row.dayOfWeek
  const d0 = days[0]
  const dN = days[days.length - 1]
  const dayLabel = d0 && dN && d0 !== dN ? `${d0}–${dN}` : d0
  return dayLabel ? `${dayLabel} ${row.opens}–${row.closes}` : `${row.opens}–${row.closes}`
}

export function buildToonFromIntake(
  intake: Intake,
  opts?: { seoKeywordCandidates?: Array<{ keyword: string; volume?: number; intent?: string }> }
) {
  const city = intake.location.locality ?? ''
  const sector = intake.location.sector ?? ''
  const address = [intake.location.addressText].filter(Boolean).join(' ')

  return {
    name: intake.client.displayName,
    shortName: intake.client.displayName,
    city: city || undefined,
    sector: sector || undefined,
    language: 'ro',
    formality: 'tu',
    mode: 'both',
    address: address || undefined,
    hours: formatHours(intake.availability.openingHours),
    languages: intake.website.languageMode === 'ro_en' ? ['ro', 'en'] : ['ro'],
    services: intake.services.map((s) => ({
      name: s.name,
      description: undefined,
      duration: s.durationMinutes,
      price: s.priceRon,
      currency: 'RON',
      calEventSlug:
        intake.calcom.serviceEventSlugs?.find((x) => x.serviceName === s.name)?.eventSlug ??
        s.slug,
    })),
    seoKeywordCandidates: opts?.seoKeywordCandidates,
    personality: {
      tone: intake.website.tone ?? 'warm_clinical',
      layoutVibe: 'balanced',
    },
    sourceNotes: {
      googleMapsReferenceUrl: '',
    },
  }
}

