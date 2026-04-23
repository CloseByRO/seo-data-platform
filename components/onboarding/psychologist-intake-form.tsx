"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { onboardingIntakeSchema, type OnboardingIntake } from '@/lib/validation/onboarding-intake'
import { matchRomanianCounty } from '@/lib/romania/counties'
import { CITY_NEIGHBORHOODS_MAPPING, listNeighborhoodsForCity, matchLocalSEOData, type SupportedCity } from '@/lib/romania/locations'
import { normalizeClientSlug } from '@/lib/clients/text'
import { expandSeedKeywordsForPsychologistGrid } from '@/lib/seo/keyword-expansion'

type Props = { orgId: string }

type Prediction = { description: string; placeId: string }

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U> ? Array<DeepPartial<U>> : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue
    const existing = out[k]
    if (
      existing &&
      v &&
      typeof existing === 'object' &&
      typeof v === 'object' &&
      !Array.isArray(existing) &&
      !Array.isArray(v)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as DeepPartial<Record<string, unknown>>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

function toSlug(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

const PRESET_SERVICES: Array<{ name: string; durationMinutes: number }> = [
  { name: 'Terapie individuală', durationMinutes: 50 },
  { name: 'Terapie de cuplu', durationMinutes: 80 },
  { name: 'Terapie copii / adolescenți', durationMinutes: 50 },
  { name: 'Evaluare psihologică', durationMinutes: 90 },
  { name: 'Ședință online', durationMinutes: 50 },
]

const PRESET_SPECIALTIES = [
  'Anxietate',
  'Depresie',
  'Terapie de cuplu',
  'Traumă',
  'Atacuri de panică',
  'ADHD (evaluare/consiliere)',
  'Burnout',
  'Stres',
  'Doliu',
  'Probleme de somn',
]

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function maskSecret(s: string | undefined) {
  if (!s?.trim()) return ''
  const t = s.trim()
  if (t.length <= 8) return '••••'
  return `${'•'.repeat(Math.min(24, t.length - 4))}${t.slice(-4)}`
}

function parseSeedKeywords(raw: string) {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, 30)
}

function normalizePhoneInput(raw: string) {
  // Keep common phone chars only; disallow letters.
  return raw.replace(/[^0-9+\s()\-]/g, '')
}

function generateSeedKeywords(opts: { locality?: string | null; county?: string | null }) {
  const loc = (opts.locality ?? '').trim()
  const county = (opts.county ?? '').trim()
  const place = loc || county
  const suffix = place ? ` ${place}` : ''
  const base = [
    `psiholog${suffix}`,
    `psihoterapeut${suffix}`,
    `cabinet psihologie${suffix}`,
    `terapie${suffix}`,
    `terapie anxietate${suffix}`,
    `terapie depresie${suffix}`,
    `terapie cuplu${suffix}`,
    `psiholog copii${suffix}`,
    `psiholog programari${suffix}`,
    `psiholog pret${suffix}`,
  ]
  return base
}

function generateSEOKeywords(args: {
  locality?: string | null
  sector?: string | null
  neighborhood?: string
  metroStation?: string | null
  specialties: string[]
}) {
  const out: string[] = []
  const seen = new Set<string>()

  function add(s: string) {
    const t = s.trim()
    if (!t) return
    const k = t.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(k)) return
    seen.add(k)
    out.push(t)
  }

  const nhood = (args.neighborhood ?? '').trim()
  const sec = (args.sector ?? '').trim()
  const loc = (args.locality ?? '').trim()
  const metro = (args.metroStation ?? '').trim()

  for (const sp of args.specialties) {
    if (!sp?.trim()) continue
    // neighborhood-first (hyper-local)
    if (nhood) {
      add(`Psiholog ${nhood}`)
      add(`Psihoterapeut ${nhood}`)
      add(`${sp} ${nhood}`)
      if (loc) add(`${sp} ${loc} ${nhood}`)
    }

    // Bucharest metro station
    if (metro) {
      add(`Psiholog ${metro}`)
      add(`${sp} ${metro}`)
      if (loc) add(`${sp} ${loc} ${metro}`)
    }

    // Bucharest sector signals
    if (sec) {
      add(`Psiholog ${sec}`)
      add(`Psihoterapeut ${sec}`)
      add(`${sp} ${sec}`)
    }

    // fallback city-level
    if (loc) add(`${sp} ${loc}`)
    add(`${sp} pret`)
  }

  return out
}

export function PsychologistIntakeForm({ orgId }: Props) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [operatorAdvanced, setOperatorAdvanced] = useState(false)
  const [step, setStep] = useState(1)
  const [status, setStatus] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [displayName, setDisplayName] = useState('')
  const [legalType, setLegalType] = useState<'CIP' | 'SRL' | 'CLINICA' | ''>('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [addressText, setAddressText] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [countyRaw, setCountyRaw] = useState<string | null>(null)
  const [locality, setLocality] = useState<string | null>(null)
  const [sector, setSector] = useState<string | null>(null)
  const [neighborhood, setNeighborhood] = useState<string>('')
  const [metroStation, setMetroStation] = useState<string | null>(null)
  const [supportedCity, setSupportedCity] = useState<SupportedCity | null>(null)
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([])
  const [detectedNeighborhood, setDetectedNeighborhood] = useState<string | null>(null)
  const county = useMemo(() => matchRomanianCounty(countyRaw), [countyRaw])
  const [intakePatch, setIntakePatch] = useState<DeepPartial<OnboardingIntake>>({})

  function updateIntake(patch: DeepPartial<OnboardingIntake>) {
    setIntakePatch((prev) => deepMerge(prev as Record<string, unknown>, patch as DeepPartial<Record<string, unknown>>) as DeepPartial<OnboardingIntake>)
  }

  const [addrQuery, setAddrQuery] = useState('')
  const [addrPredictions, setAddrPredictions] = useState<Prediction[]>([])
  const [addrOpen, setAddrOpen] = useState(false)
  const [addrLoading, setAddrLoading] = useState(false)
  const [addrError, setAddrError] = useState<string | null>(null)

  const [languageMode, setLanguageMode] = useState<'ro' | 'ro_en'>('ro')
  const [websiteTone, setWebsiteTone] = useState<
    | 'warm_clinical'
    | 'warm_conversational'
    | 'structured_direct'
    | 'gentle_reflective'
    | 'energetic_supportive'
    | 'minimal_precise'
  >('warm_clinical')
  const [otherLanguagesNotes, setOtherLanguagesNotes] = useState('')
  const [hasOldWebsite, setHasOldWebsite] = useState(false)
  const [oldWebsiteUrl, setOldWebsiteUrl] = useState('')
  const [domain, setDomain] = useState('')
  const [wantsDomainMigration, setWantsDomainMigration] = useState(false)
  const [dnsAccessAvailable, setDnsAccessAvailable] = useState<boolean>(false)
  const [wantsWebsite, setWantsWebsite] = useState(true)

  const [openingHours, setOpeningHours] = useState<
    Array<{
      dayOfWeek: Array<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>
      opens: string
      closes: string
    }>
  >([{ dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '18:00' }])

  const [heroImage, setHeroImage] = useState<File | null>(null)
  const [galleryImages, setGalleryImages] = useState<File[]>([])
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null)
  const [galleryPreviewUrls, setGalleryPreviewUrls] = useState<string[]>([])

  const [paymentMethods, setPaymentMethods] = useState<Array<'cash' | 'bank_transfer' | 'card' | 'revolut' | 'insurance'>>(
    ['cash', 'bank_transfer'],
  )
  const [cancellationPolicy, setCancellationPolicy] = useState(
    'Anulările/reprogramările se fac cu minim 24h înainte. Pentru ședințele neanunțate, ne rezervăm dreptul să percepem contravaloarea.',
  )
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('')
  const [nearbyTransportRaw, setNearbyTransportRaw] = useState('')
  const [parkingNotes, setParkingNotes] = useState('')
  const [faqs, setFaqs] = useState<
    Array<{ question: string; answer: string }>
  >([
    {
      question: 'Cât durează o ședință?',
      answer: 'O ședință standard durează 50 minute (poate varia în funcție de serviciu).',
    },
    {
      question: 'Cum se face programarea?',
      answer: 'Programarea se poate face online (Cal.com) sau telefonic. Confirmarea se trimite automat.',
    },
    {
      question: 'Care este politica de anulare?',
      answer: 'Reprogramările/anulările se fac cu minim 24h înainte.',
    },
  ])

  const [gbpPrimaryCategory, setGbpPrimaryCategory] = useState('Psiholog')
  const [gbpAdditionalCategoriesRaw, setGbpAdditionalCategoriesRaw] = useState('')
  const [gbpDescription, setGbpDescription] = useState('')
  const [gbpAttributesRaw, setGbpAttributesRaw] = useState('Programări online, Consiliere psihologică')

  const [calAppointmentUrlOverride, setCalAppointmentUrlOverride] = useState('')
  const [calServiceSlugs, setCalServiceSlugs] = useState<Record<string, string>>({})
  const [calMeetingModes, setCalMeetingModes] = useState<Record<string, 'in_person' | 'online' | 'both'>>({})

  const [services, setServices] = useState<
    Array<{ name: string; slug: string; durationMinutes: number; priceRon: number | null }>
  >([])
  const [customServiceName, setCustomServiceName] = useState('')
  const [customServiceDuration, setCustomServiceDuration] = useState<string>('')
  const [customServicePrice, setCustomServicePrice] = useState<string>('')

  const [specialties, setSpecialties] = useState<string[]>([])
  const [customSpecialty, setCustomSpecialty] = useState('')

  const [useWhatsapp, setUseWhatsapp] = useState(false)
  const [useCalcom, setUseCalcom] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [calUsername, setCalUsername] = useState('')
  const [calApiKey, setCalApiKey] = useState('')
  const [revealCalKey, setRevealCalKey] = useState(false)

  const [clientGoogleAccountEmail, setClientGoogleAccountEmail] = useState('')
  const [gbpHasGoogleAccount, setGbpHasGoogleAccount] = useState<'yes' | 'no' | 'unknown'>('unknown')
  const [gbpAccessMethod, setGbpAccessMethod] = useState<'client_invite' | 'we_request' | 'unknown'>('unknown')
  const [profileExists, setProfileExists] = useState<boolean>(true)
  const [profileClaimed, setProfileClaimed] = useState<boolean>(true)
  const [gbpMapsUrl, setGbpMapsUrl] = useState('')
  const [gbpOperatorEmail, setGbpOperatorEmail] = useState('')
  const [gbpVerificationExpected, setGbpVerificationExpected] = useState<
    'unknown' | 'postcard' | 'phone' | 'video'
  >('unknown')

  const [seedKeywordsRaw, setSeedKeywordsRaw] = useState('')
  // keywords are internal-only; no operator approval needed in the intake UI
  const [seedKeywordsDirty] = useState(false)

  function parseLegalType(v: string): 'CIP' | 'SRL' | 'CLINICA' | '' {
    if (v === 'CIP' || v === 'SRL' || v === 'CLINICA') return v
    return ''
  }

  function parseLanguageMode(v: string): 'ro' | 'ro_en' {
    return v === 'ro_en' ? 'ro_en' : 'ro'
  }

  function parseVerificationExpected(v: string): 'unknown' | 'postcard' | 'phone' | 'video' {
    if (v === 'postcard' || v === 'phone' || v === 'video') return v
    return 'unknown'
  }

  async function resizeImageFile(
    file: File,
    opts: { maxWidth: number; maxHeight: number; quality: number; outType?: 'image/jpeg' | 'image/webp' } = {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.85,
      outType: 'image/jpeg',
    },
  ): Promise<File> {
    const outType = opts.outType ?? 'image/jpeg'
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height)
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, w, h)

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), outType, opts.quality),
      )
      if (!blob) return file

      const base = file.name.replace(/\.[^/.]+$/, '')
      const ext = outType === 'image/webp' ? 'webp' : 'jpg'
      return new File([blob], `${base}.optimized.${ext}`, { type: outType, lastModified: Date.now() })
    } catch {
      return file
    }
  }

  useEffect(() => {
    if (heroPreviewUrl) URL.revokeObjectURL(heroPreviewUrl)
    if (!heroImage) {
      setHeroPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(heroImage)
    setHeroPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroImage])

  useEffect(() => {
    for (const u of galleryPreviewUrls) URL.revokeObjectURL(u)
    if (!galleryImages.length) {
      setGalleryPreviewUrls([])
      return
    }
    const urls = galleryImages.map((f) => URL.createObjectURL(f))
    setGalleryPreviewUrls(urls)
    return () => {
      for (const u of urls) URL.revokeObjectURL(u)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryImages])

  const derivedCalAppointmentUrl = useMemo(() => {
    const u = calUsername.trim()
    if (!u) return undefined
    return `https://cal.com/${u}`
  }, [calUsername])

  const derivedGbpDescription = useMemo(() => {
    const loc = [locality?.trim(), county?.trim()].filter(Boolean).join(', ')
    const base = displayName.trim() || 'Cabinet'
    const specialtiesShort = specialties.slice(0, 4).join(', ')
    const tail = specialtiesShort ? `Specializări: ${specialtiesShort}.` : ''
    const where = loc ? `În ${loc}.` : ''
    const appt = derivedCalAppointmentUrl ? `Programări: ${derivedCalAppointmentUrl}.` : ''
    return `${base}. ${where} ${tail} ${appt}`.replace(/\s+/g, ' ').trim().slice(0, 750)
  }, [county, derivedCalAppointmentUrl, displayName, locality, specialties])

  const derivedGbpAdditionalCategories = useMemo(() => {
    const set = new Set<string>()
    for (const s of specialties.map((x) => x.toLowerCase())) {
      if (s.includes('terapie')) set.add('Psihoterapeut')
      if (s.includes('cuplu')) set.add('Terapie de cuplu')
      if (s.includes('adhd')) set.add('Psiholog clinician')
      if (s.includes('traum')) set.add('Consilier psihologic')
      if (s.includes('anx')) set.add('Consilier psihologic')
      if (s.includes('depres')) set.add('Consilier psihologic')
      if (s.includes('copii') || s.includes('adolescent')) set.add('Psiholog')
    }
    // keep short and safe
    return Array.from(set).slice(0, 3)
  }, [specialties])

  const derivedGbpAttributes = useMemo(() => {
    const set = new Set<string>()
    if (useCalcom) set.add('Programări online')
    if (services.some((s) => s.name.toLowerCase().includes('online'))) set.add('Ședințe online')
    set.add('Confidențialitate')
    return Array.from(set).slice(0, 8)
  }, [services, useCalcom])

  useEffect(() => {
    // Default-fill once, still editable.
    if (!gbpDescription.trim() && derivedGbpDescription) setGbpDescription(derivedGbpDescription)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedGbpDescription])

  useEffect(() => {
    if (!gbpAdditionalCategoriesRaw.trim() && derivedGbpAdditionalCategories.length) {
      setGbpAdditionalCategoriesRaw(derivedGbpAdditionalCategories.join(', '))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedGbpAdditionalCategories])

  useEffect(() => {
    if (!gbpAttributesRaw.trim() && derivedGbpAttributes.length) setGbpAttributesRaw(derivedGbpAttributes.join(', '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedGbpAttributes])

  useEffect(() => {
    // Keep Cal event slugs/modes in sync with selected services (non-destructive).
    setCalServiceSlugs((prev) => {
      const next: Record<string, string> = { ...prev }
      for (const s of services) {
        if (!next[s.name]) next[s.name] = toSlug(s.name)
      }
      for (const k of Object.keys(next)) {
        if (!services.some((s) => s.name === k)) delete next[k]
      }
      return next
    })
    setCalMeetingModes((prev) => {
      const next: Record<string, 'in_person' | 'online' | 'both'> = { ...prev }
      for (const s of services) {
        if (!next[s.name]) next[s.name] = 'both'
      }
      for (const k of Object.keys(next)) {
        if (!services.some((s) => s.name === k)) delete next[k]
      }
      return next
    })
  }, [services])

  const intake: OnboardingIntake = useMemo(
    () => ({
      orgId,
      debugOnly: true,
      client: {
        displayName,
        legalType: legalType || undefined,
        email,
        phone,
      },
      location: {
        addressText,
        placeId,
        lat: lat ?? Number.NaN,
        lng: lng ?? Number.NaN,
        // Keep invalid until derived from Places (do not silently default).
        county: (county ?? ('UNKNOWN' as unknown as OnboardingIntake['location']['county'])) as OnboardingIntake['location']['county'],
        sector: sector ?? undefined,
        neighborhood: neighborhood.trim() ? neighborhood.trim() : undefined,
        countyRaw: countyRaw ?? undefined,
        locality: locality ?? undefined,
      },
      website: {
        wantsWebsite,
        languageMode,
        tone: websiteTone,
        otherLanguagesNotes: otherLanguagesNotes.trim() ? otherLanguagesNotes.trim() : undefined,
        hasOldWebsite,
        oldWebsiteUrl: oldWebsiteUrl.trim() ? oldWebsiteUrl.trim() : undefined,
        reuseOldWebsiteContent: false,
        domain: domain.trim() ? domain.trim() : undefined,
        wantsDomainMigration,
        dnsAccessAvailable,
      },
      availability: { openingHours },
      media: {
        heroImageName: heroImage ? heroImage.name : undefined,
        galleryImageNames: galleryImages.map((f) => f.name).slice(0, 3),
      },
      services: services
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          slug: s.slug || toSlug(s.name),
          durationMinutes: s.durationMinutes,
          priceRon: s.priceRon ?? 0,
        })),
      specialties,
      automation: {
        useWhatsapp,
        useCalcom,
        whatsappNumber: whatsappNumber.trim() ? whatsappNumber.trim() : undefined,
        calUsername: calUsername.trim() ? calUsername.trim() : undefined,
        calApiKey: calApiKey.trim() ? calApiKey.trim() : undefined,
        timezone: 'Europe/Bucharest',
      },
      calcom: {
        appointmentUrl: (calAppointmentUrlOverride.trim() ? calAppointmentUrlOverride.trim() : derivedCalAppointmentUrl) ?? undefined,
        serviceEventSlugs: services.map((s) => ({
          serviceName: s.name,
          eventSlug: calServiceSlugs[s.name] || toSlug(s.name),
        })),
        meetingModeByService: services.map((s) => ({
          serviceName: s.name,
          mode: calMeetingModes[s.name] || 'both',
        })),
      },
      gbp: {
        hasGoogleAccount: gbpHasGoogleAccount,
        accessMethod: gbpAccessMethod,
        clientGoogleAccountEmail: clientGoogleAccountEmail.trim() ? clientGoogleAccountEmail.trim() : undefined,
        status: 'pending',
        profileExists,
        profileClaimed: profileExists ? profileClaimed : undefined,
        mapsUrl: gbpMapsUrl.trim() ? gbpMapsUrl.trim() : undefined,
        placeId: placeId.trim() ? placeId.trim() : undefined,
        operatorAccessEmail: gbpOperatorEmail.trim() ? gbpOperatorEmail.trim() : undefined,
        verificationExpected: gbpVerificationExpected,
        primaryCategory: gbpPrimaryCategory.trim() || 'Psiholog',
        additionalCategories: gbpAdditionalCategoriesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5),
        description: gbpDescription.trim() ? gbpDescription.trim() : undefined,
        appointmentUrl: derivedCalAppointmentUrl ? derivedCalAppointmentUrl : undefined,
        attributes: gbpAttributesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
      },
      websiteContent: {
        paymentMethods,
        cancellationPolicy: cancellationPolicy.trim() ? cancellationPolicy.trim() : undefined,
        faqs,
        nearbyTransport: nearbyTransportRaw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12),
        parkingNotes: parkingNotes.trim() ? parkingNotes.trim() : undefined,
        privacyPolicyUrl: privacyPolicyUrl.trim() ? privacyPolicyUrl.trim() : undefined,
      },
      // Keywords are internal-only; keep seeds for DataForSEO pipeline, but do not require operator approval in the form.
      keywords: {
        seedKeywords: Array.from(
          new Set(
            [
              ...parseSeedKeywords(seedKeywordsRaw),
              ...generateSEOKeywords({ locality, sector, neighborhood, metroStation, specialties }),
            ].map((s) =>
              s.trim(),
            ),
          ),
        ).filter(Boolean),
        approvedByOperator: false,
      },
    }),
    [
      addressText,
      calAppointmentUrlOverride,
      calMeetingModes,
      calServiceSlugs,
      useWhatsapp,
      useCalcom,
      calApiKey,
      calUsername,
      clientGoogleAccountEmail,
      county,
      countyRaw,
      displayName,
      dnsAccessAvailable,
      domain,
      email,
      cancellationPolicy,
      faqs,
      galleryImages,
      gbpMapsUrl,
      gbpAccessMethod,
      gbpHasGoogleAccount,
      gbpAdditionalCategoriesRaw,
      gbpAttributesRaw,
      gbpDescription,
      gbpOperatorEmail,
      gbpPrimaryCategory,
      gbpVerificationExpected,
      hasOldWebsite,
      heroImage,
      sector,
      languageMode,
      websiteTone,
      lat,
      legalType,
      lng,
      locality,
      nearbyTransportRaw,
      derivedCalAppointmentUrl,
      openingHours,
      oldWebsiteUrl,
      orgId,
      otherLanguagesNotes,
      parkingNotes,
      paymentMethods,
      phone,
      placeId,
      privacyPolicyUrl,
      profileClaimed,
      profileExists,
      neighborhood,
      metroStation,
      seedKeywordsRaw,
      services,
      specialties,
      wantsWebsite,
      wantsDomainMigration,
      whatsappNumber,
    ],
  )

  const intakeMerged = useMemo(() => deepMerge(intake as unknown as Record<string, unknown>, intakePatch as DeepPartial<Record<string, unknown>>) as OnboardingIntake, [
    intake,
    intakePatch,
  ])

  // Keyword generation stays internal-only (not displayed in UI).
  useMemo(() => {
    const seed = parseSeedKeywords(seedKeywordsRaw)
    void expandSeedKeywordsForPsychologistGrid({
      locality,
      county: county ?? countyRaw,
      seedKeywords: seed,
      services: services.map((s) => s.name).filter(Boolean),
      specialties,
      targetCount: 40,
    })
  }, [county, countyRaw, locality, seedKeywordsRaw, services, specialties])

  const intakeMasked = useMemo(() => {
    const clone = JSON.parse(JSON.stringify(intakeMerged)) as OnboardingIntake
    if (clone.automation?.calApiKey) clone.automation.calApiKey = maskSecret(clone.automation.calApiKey)
    return clone
  }, [intakeMerged])

  const validation = useMemo(() => onboardingIntakeSchema.safeParse(intakeMerged), [intakeMerged])

  const addrQueryRef = useRef('')
  addrQueryRef.current = addrQuery

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const q = addrQuery.trim()
    if (q.length < 3) {
      setAddrPredictions([])
      setAddrError(null)
      return
    }

    let cancelled = false
    const t = setTimeout(async () => {
      setAddrLoading(true)
      setAddrError(null)
      try {
        const res = await fetch('/api/google/places/autocomplete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orgId, input: q, language: 'ro', region: 'ro' }),
        })
        const json = (await res.json()) as { predictions?: Prediction[]; error?: string }
        if (cancelled) return
        if (!res.ok) {
          setAddrError(json.error ?? 'Autocomplete failed')
          setAddrPredictions([])
          return
        }
        setAddrPredictions(json.predictions ?? [])
        setAddrOpen(true)
      } catch (e) {
        if (cancelled) return
        setAddrError(e instanceof Error ? e.message : String(e))
        setAddrPredictions([])
      } finally {
        if (!cancelled) setAddrLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [addrQuery, orgId])

  useEffect(() => {
    if (seedKeywordsDirty) return
    if (!county && !locality) return
    const kws = generateSeedKeywords({ locality, county: county ?? countyRaw })
    setSeedKeywordsRaw(kws.join('\n'))
  }, [county, countyRaw, locality, seedKeywordsDirty])

  async function selectPrediction(predPlaceId: string, description: string) {
    setAddrOpen(false)
    setAddrError(null)
    setAddressText(description)
    setAddrQuery(description)
    setPlaceId(predPlaceId)
    try {
      const res = await fetch('/api/google/places/details', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId, placeId: predPlaceId, language: 'ro' }),
      })
      const json = (await res.json()) as {
        formattedAddress?: string | null
        lat?: number
        lng?: number
        locality?: string | null
        region?: string | null
        sector?: string | null
        neighborhood?: string | null
        error?: string
      }
      if (!res.ok) {
        setAddrError(json.error ?? 'Failed to load address details')
        return
      }
      if (json.formattedAddress) {
        setAddressText(json.formattedAddress)
        setAddrQuery(json.formattedAddress)
      }
      if (json.lat != null && json.lng != null) {
        setLat(json.lat)
        setLng(json.lng)
      }
      setLocality(json.locality ?? null)
      setCountyRaw(json.region ?? null)
      const derivedSector =
        json.sector ??
        (json.formattedAddress && /sector\s*\d/i.test(json.formattedAddress) ? json.formattedAddress.match(/sector\s*\d/gi)?.[0] ?? null : null) ??
        (description && /sector\s*\d/i.test(description) ? description.match(/sector\s*\d/gi)?.[0] ?? null : null)
      setSector(derivedSector ? derivedSector.replace(/\s+/g, ' ').trim() : null)

      // Neighborhood detection for major cities
      const cityRaw =
        (json.locality ?? '').trim() ||
        ((json.region ?? '').toLowerCase().includes('bucure') ? 'București' : '')
      const m =
        cityRaw && (json.formattedAddress || description)
          ? matchLocalSEOData({
              localityRaw: cityRaw,
              formattedAddress: json.formattedAddress ?? description,
              googleNeighborhood: json.neighborhood,
            })
          : null
      if (m?.city) {
        setSupportedCity(m.city)
        const options = listNeighborhoodsForCity(m.city, m.subdivision)
        setNeighborhoodOptions(options)
        setMetroStation(m.metroStation ?? null)

        if (m.city === 'București') {
          // For Bucharest, subdivision is Sector X; keep sector + optional neighborhood.
          if (m.subdivision?.toLowerCase().includes('sector')) setSector(m.subdivision)
          setDetectedNeighborhood(m.neighborhood ?? null)
          if (m.neighborhood) setNeighborhood(m.neighborhood)
        } else {
          setDetectedNeighborhood(m.neighborhood ?? null)
          if (m.neighborhood) setNeighborhood(m.neighborhood)
        }

        // Deep-merge patch so later nested updates never wipe `location`.
        updateIntake({
          location: {
            sector: m.city === 'București' ? (m.subdivision ?? undefined) : undefined,
            neighborhood: m.neighborhood ?? undefined,
            locality: m.city,
          },
        })
      } else {
        setSupportedCity(null)
        setNeighborhoodOptions([])
        setDetectedNeighborhood(null)
        setNeighborhood('')
        setMetroStation(null)
      }
    } catch (e) {
      setAddrError(e instanceof Error ? e.message : String(e))
    }
  }

  function toggleSpecialty(label: string) {
    setSpecialties((prev) => (prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]))
  }

  function addCustomSpecialty() {
    const t = customSpecialty.trim()
    if (!t) return
    setSpecialties((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setCustomSpecialty('')
  }

  function addPresetService(svc: { name: string; durationMinutes: number }) {
    setServices((prev) => {
      if (prev.some((x) => x.name.toLowerCase() === svc.name.toLowerCase())) return prev
      return [
        ...prev,
        { name: svc.name, slug: toSlug(svc.name), durationMinutes: svc.durationMinutes, priceRon: null },
      ]
    })
  }

  function removeService(name: string) {
    setServices((prev) => prev.filter((s) => s.name !== name))
  }

  function addCustomService() {
    const name = customServiceName.trim()
    if (!name) return
    const duration = customServiceDuration.trim() ? Number(customServiceDuration) : NaN
    const price = customServicePrice.trim() ? Number(customServicePrice) : NaN

    setServices((prev) => [
      ...prev,
      {
        name,
        slug: toSlug(name),
        durationMinutes: Number.isFinite(duration) ? duration : 50,
        priceRon: Number.isFinite(price) ? price : null,
      },
    ])
    setCustomServiceName('')
    setCustomServiceDuration('')
    setCustomServicePrice('')
  }

  function setServicePrice(name: string, raw: string) {
    const n = raw.trim() ? Number(raw) : NaN
    setServices((prev) => prev.map((s) => (s.name === name ? { ...s, priceRon: Number.isFinite(n) ? n : null } : s)))
  }

  function setServiceDuration(name: string, raw: string) {
    const n = raw.trim() ? Number(raw) : NaN
    setServices((prev) =>
      prev.map((s) =>
        s.name === name ? { ...s, durationMinutes: Number.isFinite(n) ? Math.round(n) : s.durationMinutes } : s,
      ),
    )
  }

  function validateCurrentStep(): boolean {
    setStatus(null)
    setErrors({})

    const parsed = onboardingIntakeSchema.safeParse(intake)
    if (parsed.success) return true

    // Only show relevant errors per step to avoid noise.
    const stepFields: Record<number, string[]> = {
      1: ['client', 'location'],
            2: ['services', 'specialties', 'website'],
            3: ['automation', 'gbp'],
      4: [],
    }
    const allow = stepFields[step] ?? []
    const nextErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const root = String(issue.path[0] ?? '')
      if (allow.length > 0 && !allow.includes(root)) continue
      nextErrors[issue.path.join('.')] = issue.message
    }
    setErrors(nextErrors)
    setStatus('Verifică câmpurile marcate.')
    return Object.keys(nextErrors).length === 0
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(intakeMasked, null, 2))
      setStatus('JSON copiat în clipboard.')
      setTimeout(() => setStatus(null), 1200)
    } catch {
      setStatus('Nu am putut copia JSON.')
    }
  }

  // Do not expose generated keywords in UI.

  const slugPreview = useMemo(() => normalizeClientSlug(displayName || ''), [displayName])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Onboarding cabinet (debug)</h2>
            <p className="mt-1 text-sm text-slate-400">
              Finalul afișează payload-ul complet (JSON). Nu se salvează în Supabase și nu rulează scripturi.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                checked={operatorAdvanced}
                onChange={(e) => setOperatorAdvanced(e.target.checked)}
              />
              Operator advanced
            </label>
            <div className="text-xs text-slate-500">
              Step <span className="text-slate-200">{step}</span> / 4
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        {Object.keys(errors).length > 0 ? (
          <div className="mb-6 rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-200">
            <div className="font-medium">Nu poți continua încă</div>
            <div className="mt-1 text-xs text-rose-200/80">Fixează câmpurile de mai jos (rezumat):</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {Object.entries(errors)
                .slice(0, 6)
                .map(([k, v]) => (
                  <li key={k}>
                    <span className="font-mono text-rose-100/90">{k}</span>: {v}
                  </li>
                ))}
              {Object.keys(errors).length > 6 ? <li>…și încă {Object.keys(errors).length - 6}</li> : null}
            </ul>
            <div className="mt-2 text-xs text-rose-200/80">
              Tip: dacă la GBP nu știi încă un răspuns, poți lăsa opțiunile pe “unknown” și revenim ulterior.
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-200">Identitate & locație</h3>
              <p className="mt-1 text-sm text-slate-500">Date de contact + adresa (Google Places) pentru coordonate.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Nume cabinet / psiholog</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ex: Cabinet Psihologie Dr. Maria Ionescu"
                />
                {displayName.trim() ? (
                  <p className="text-xs text-slate-500">
                    Slug propus: <span className="font-mono text-emerald-300">{slugPreview}</span>
                  </p>
                ) : null}
                {errors['client.displayName'] ? <p className="text-xs text-rose-300">{errors['client.displayName']}</p> : null}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Tip entitate (opțional)</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={legalType}
                  onChange={(e) => setLegalType(parseLegalType(e.target.value))}
                >
                  <option value="">—</option>
                  <option value="CIP">CIP — Cabinet Individual Psiholog</option>
                  <option value="SRL">SRL</option>
                  <option value="CLINICA">Clinică / Centru</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Email</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inputMode="email"
                  placeholder="contact@…"
                />
                {errors['client.email'] ? <p className="text-xs text-rose-300">{errors['client.email']}</p> : null}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-200">Telefon</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                  inputMode="tel"
                  placeholder="ex: 07xx xxx xxx"
                />
                {errors['client.phone'] ? <p className="text-xs text-rose-300">{errors['client.phone']}</p> : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Adresă (Google Places)</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={addressText}
                onChange={(e) => {
                  setAddressText(e.target.value)
                  setAddrQuery(e.target.value)
                  setAddrOpen(true)
                }}
                onFocus={() => {
                  setAddrQuery(addressText)
                  setAddrOpen(true)
                }}
                onBlur={() => setTimeout(() => setAddrOpen(false), 120)}
                placeholder="Începe să scrii și alege o sugestie…"
              />
              {addrOpen && (addrPredictions.length > 0 || addrLoading || addrError) ? (
                <div className="relative">
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-lg">
                    {addrLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-400">Caut…</div>
                    ) : addrError ? (
                      <div className="px-3 py-2 text-sm text-rose-300">{addrError}</div>
                    ) : addrPredictions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-400">Nicio sugestie</div>
                    ) : (
                      <div className="max-h-64 overflow-auto">
                        {addrPredictions.slice(0, 8).map((p) => (
                          <button
                            key={p.placeId}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void selectPrediction(p.placeId, p.description)}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-900"
                          >
                            {p.description}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Lat/Lng</div>
                  <div className="mt-1 font-mono text-slate-200">
                    {lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Județ (detectat)</div>
                  <div className="mt-1 text-slate-200">{county ?? '—'}</div>
                  {errors['location.county'] ? <div className="mt-1 text-rose-300">{errors['location.county']}</div> : null}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Place ID</div>
                  <div className="mt-1 break-all font-mono text-slate-200">{placeId ? placeId : '—'}</div>
                </div>
              </div>

              {supportedCity ? (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Sector (București)</div>
                    <div className="mt-1 font-mono text-slate-200">{sector ?? '—'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Cartier / Zonă</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Alege din dropdown sau completează manual…"
                    />
                    {errors['location.neighborhood'] ? (
                      <p className="text-xs text-rose-300">{errors['location.neighborhood']}</p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Disponibil doar pentru orașe suportate (SEO hyper-local).
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {supportedCity ? (
                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Location Intelligence</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Detectăm automat zona SEO (oraș / sector / cartier). Dacă Google e vag, folosim ancorele noastre (străzi/repere/metro).
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-700/40 bg-emerald-950/20 px-3 py-1 text-xs text-emerald-200">
                      Hyper-local: ON
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Oraș</div>
                      <div className="mt-1 text-sm font-medium text-slate-200">{supportedCity}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Sector (București)</div>
                      <div className="mt-1 text-sm font-medium text-slate-200">{supportedCity === 'București' ? sector ?? '—' : '—'}</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Cartier</div>
                      <div className="mt-1 text-sm font-medium text-slate-200">{(detectedNeighborhood ?? neighborhood) ?? '—'}</div>
                      {!detectedNeighborhood && !neighborhood ? (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Nu am putut detecta sigur cartierul din adresă (ok). Rămânem pe oraș/sector.
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {supportedCity === 'București' && metroStation ? (
                    <div className="mt-2 text-xs text-slate-400">
                      Metro detectat: <span className="font-medium text-slate-200">{metroStation}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {errors['location.placeId'] ? <p className="text-xs text-rose-300">{errors['location.placeId']}</p> : null}
              {errors['location.lat'] || errors['location.lng'] ? (
                <p className="text-xs text-rose-300">Selectează o sugestie Google Places ca să avem coordonate.</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-sm font-medium text-slate-200">Vrei website?</p>
              <p className="mt-1 text-xs text-slate-500">
                Dacă nu, rămânem pe GBP + (opțional) Cal.com și/sau WhatsApp pentru update-uri.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWantsWebsite(true)}
                  className={clsx(
                    'rounded-lg border px-3 py-2 text-sm',
                    wantsWebsite
                      ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                  )}
                >
                  Da, vreau website
                </button>
                <button
                  type="button"
                  onClick={() => setWantsWebsite(false)}
                  className={clsx(
                    'rounded-lg border px-3 py-2 text-sm',
                    !wantsWebsite
                      ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                  )}
                >
                  Nu, fără website
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-200">Program (pentru Cal.com + GBP)</p>
              <p className="text-xs text-slate-500">
                Îl folosim pentru setarea event types în Cal.com și pentru afișarea programului în Google Business Profile.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Zile</label>
                  <div className="flex flex-wrap gap-2">
                    {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const).map((d) => {
                      const checked = (openingHours[0]?.dayOfWeek ?? []).includes(d)
                      return (
                        <label
                          key={d}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                            checked={checked}
                            onChange={(e) => {
                              setOpeningHours((prev) => {
                                const first =
                                  prev[0] ??
                                  ({
                                    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                                    opens: '09:00',
                                    closes: '18:00',
                                  } as const)
                                const set = new Set(first.dayOfWeek)
                                if (e.target.checked) set.add(d)
                                else set.delete(d)
                                return [{ ...first, dayOfWeek: Array.from(set) as typeof first.dayOfWeek }, ...prev.slice(1)]
                              })
                            }}
                          />
                          {d.slice(0, 3)}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Opens</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={openingHours[0]?.opens ?? '09:00'}
                      onChange={(e) =>
                        setOpeningHours((prev) => [
                          { ...(prev[0] ?? { dayOfWeek: ['Monday'], opens: '09:00', closes: '18:00' }), opens: e.target.value },
                          ...prev.slice(1),
                        ])
                      }
                      placeholder="09:00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Closes</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={openingHours[0]?.closes ?? '18:00'}
                      onChange={(e) =>
                        setOpeningHours((prev) => [
                          { ...(prev[0] ?? { dayOfWeek: ['Monday'], opens: '09:00', closes: '18:00' }), closes: e.target.value },
                          ...prev.slice(1),
                        ])
                      }
                      placeholder="18:00"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-200">Website, servicii, specialități & GBP</h3>
              <p className="mt-1 text-sm text-slate-500">Definim oferta, opțiunile de limbă/domeniu și setup-ul Google Business Profile.</p>
            </div>

            {wantsWebsite ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-200">Limbă UI</label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={languageMode}
                      onChange={(e) => setLanguageMode(parseLanguageMode(e.target.value))}
                    >
                      <option value="ro">Română</option>
                      <option value="ro_en">Română + Engleză</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-200">Ton site (copy)</label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={websiteTone}
                      onChange={(e) =>
                        setWebsiteTone(
                          (e.target.value as typeof websiteTone) || 'warm_clinical',
                        )
                      }
                    >
                      <option value="warm_clinical">Warm clinical (default)</option>
                      <option value="warm_conversational">Warm conversational</option>
                      <option value="structured_direct">Structured direct</option>
                      <option value="gentle_reflective">Gentle reflective</option>
                      <option value="energetic_supportive">Energetic supportive</option>
                      <option value="minimal_precise">Minimal precise</option>
                    </select>
                    <p className="text-xs text-slate-500">
                      Afectează stilul și ritmul textelor generate (nu schimbă conținutul factual).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-200">Alte limbi (manual, cost extra)</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={otherLanguagesNotes}
                      onChange={(e) => setOtherLanguagesNotes(e.target.value)}
                      placeholder="ex: Franceză — de discutat separat"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Site vechi (pentru inspirație)?</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Dacă există, îl folosim ca referință pentru structură/ton.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                        checked={hasOldWebsite}
                        onChange={(e) => setHasOldWebsite(e.target.checked)}
                      />
                      Da
                    </label>
                  </div>
                  {hasOldWebsite ? (
                    <div className="mt-3 space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">URL site vechi</label>
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={oldWebsiteUrl}
                        onChange={(e) => setOldWebsiteUrl(e.target.value)}
                        placeholder="https://…"
                      />
                      {errors['website.oldWebsiteUrl'] ? (
                        <p className="text-xs text-rose-300">{errors['website.oldWebsiteUrl']}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Domeniu</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Dacă se dorește migrare, o tratăm ca task separat (manual).
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                        checked={wantsDomainMigration}
                        onChange={(e) => setWantsDomainMigration(e.target.checked)}
                      />
                      Vreau migrare pe domeniul acesta
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Domeniu (fără https)
                      </label>
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="ex: cabinet-psihologie.ro"
                      />
                      {errors['website.domain'] ? (
                        <p className="text-xs text-rose-300">{errors['website.domain']}</p>
                      ) : null}
                    </div>
                    {wantsDomainMigration ? (
                      <label className="inline-flex items-center gap-2 text-sm text-slate-300 mt-6 md:mt-0">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                          checked={dnsAccessAvailable}
                          onChange={(e) => setDnsAccessAvailable(e.target.checked)}
                        />
                        Avem acces la DNS / modificări domeniu
                      </label>
                    ) : (
                      <div className="text-xs text-slate-500 mt-6 md:mt-0">
                        Dacă domeniul nu este stabilit acum, putem decide ulterior.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-200">Imagini website (hero + galerie)</p>
                  <p className="text-xs text-slate-500">
                    Le optimizăm local (resize + compresie) ca să le putem urca rapid mai târziu. Debug-only: în payload
                    păstrăm doar numele fișierelor optimizate.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Hero (1)</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) {
                            setHeroImage(null)
                            return
                          }
                          const optimized = await resizeImageFile(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
                          setHeroImage(optimized)
                        }}
                      />
                      {heroImage ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs text-slate-300">{heroImage.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {Math.round(heroImage.size / 1024)} KB · {heroImage.type || 'image'}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900"
                            onClick={() => setHeroImage(null)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                      {heroPreviewUrl ? (
                        <div className="relative h-40 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                          <Image src={heroPreviewUrl} alt="Hero preview" fill unoptimized className="object-cover" />
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Galerie (max 3)</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []).slice(0, 3)
                          if (!files.length) {
                            setGalleryImages([])
                            return
                          }
                          const optimized = await Promise.all(
                            files.map((f) => resizeImageFile(f, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })),
                          )
                          setGalleryImages(optimized)
                        }}
                      />
                      {galleryImages.length ? (
                        <div className="space-y-2">
                          {galleryImages.map((f) => (
                            <div
                              key={f.name}
                              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 p-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs text-slate-300">{f.name}</p>
                                <p className="text-[11px] text-slate-500">
                                  {Math.round(f.size / 1024)} KB · {f.type || 'image'}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900"
                                onClick={() => setGalleryImages((prev) => prev.filter((x) => x !== f))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {galleryPreviewUrls.length ? (
                        <div className="grid grid-cols-3 gap-2">
                          {galleryPreviewUrls.map((u, idx) => (
                            <div key={u} className="relative h-20 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                              <Image src={u} alt={`Gallery ${idx + 1}`} fill unoptimized className="object-cover" />
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Website — informații utile</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Multe se pot seta implicit, dar aici avem override-uri care ajută la generarea site-ului + GDPR + copy.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Metode de plată</label>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'cash', label: 'Cash' },
                          { id: 'bank_transfer', label: 'Transfer bancar' },
                          { id: 'card', label: 'Card' },
                          { id: 'revolut', label: 'Revolut' },
                          { id: 'insurance', label: 'Decontare (asigurare)' },
                        ] as const
                      ).map((m) => {
                        const checked = paymentMethods.includes(m.id)
                        return (
                          <label
                            key={m.id}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                              checked={checked}
                              onChange={(e) =>
                                setPaymentMethods((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(m.id)
                                  else next.delete(m.id)
                                  return Array.from(next)
                                })
                              }
                            />
                            {m.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Politică anulare (site)</label>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={cancellationPolicy}
                      onChange={(e) => setCancellationPolicy(e.target.value)}
                      placeholder="ex: reprogramări cu minim 24h înainte…"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Transport (1 per linie)</label>
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={nearbyTransportRaw}
                        onChange={(e) => setNearbyTransportRaw(e.target.value)}
                        placeholder="ex: Metro M2 · Universitate (5 min)\nAutobuz 3xx…"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Parcare (opțional)</label>
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={parkingNotes}
                        onChange={(e) => setParkingNotes(e.target.value)}
                        placeholder="ex: Parcare publică pe stradă…"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Privacy policy URL (opțional)
                    </label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={privacyPolicyUrl}
                      onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                      placeholder="https://… sau /politica-confidentialitate"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">FAQ (site)</label>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900"
                        onClick={() => setFaqs((prev) => [...prev, { question: '', answer: '' }].slice(0, 12))}
                      >
                        Add Q&A
                      </button>
                    </div>
                    <div className="space-y-3">
                      {faqs.map((qa, idx) => (
                        <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <input
                              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                              value={qa.question}
                              onChange={(e) =>
                                setFaqs((prev) => prev.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x)))
                              }
                              placeholder="Întrebare"
                            />
                            <button
                              type="button"
                              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
                              onClick={() => setFaqs((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Remove
                            </button>
                          </div>
                          <textarea
                            className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                            value={qa.answer}
                            onChange={(e) =>
                              setFaqs((prev) => prev.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x)))
                            }
                            placeholder="Răspuns"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
                Website este dezactivat — sărim peste setările de limbă, site vechi și domeniu.
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">Servicii (cu prețuri)</p>
                  <p className="mt-1 text-xs text-slate-500">Prețul e manual (diferă per client). RON / ședință.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_SERVICES.map((s) => {
                  const selected = services.some((x) => x.name.toLowerCase() === s.name.toLowerCase())
                  return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => addPresetService(s)}
                    disabled={selected}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs',
                      selected
                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200 cursor-default opacity-90'
                        : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                    )}
                  >
                    {selected ? '✓ ' : '+ '}
                    {s.name}
                  </button>
                  )
                })}
              </div>

              {services.length > 0 ? (
                <div className="space-y-2">
                  {services.map((s, idx) => (
                    <div
                      key={s.name}
                      className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-200">{s.name}</div>
                        <div className="text-xs text-slate-500">Setează durată + preț (editabile).</div>
                      </div>
                      <div className="flex flex-col items-stretch gap-2 md:items-center md:flex-row md:gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 md:hidden">Durată (min)</span>
                          <input
                            className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                            value={s.durationMinutes == null ? '' : String(s.durationMinutes)}
                            onChange={(e) => setServiceDuration(s.name, e.target.value)}
                            inputMode="numeric"
                            placeholder="50"
                          />
                          <span className="text-xs text-slate-500">min</span>
                        </div>
                        {errors[`services.${idx}.priceRon`] ? (
                          <span className="text-xs text-rose-300">{errors[`services.${idx}.priceRon`]}</span>
                        ) : (
                          <span className="text-xs text-slate-500 md:hidden">Preț (RON)</span>
                        )}
                        <input
                          className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                          value={s.priceRon == null ? '' : String(s.priceRon)}
                          onChange={(e) => setServicePrice(s.name, e.target.value)}
                          inputMode="numeric"
                          placeholder="250"
                        />
                        <span className="text-xs text-slate-500">RON</span>
                        <button
                          type="button"
                          onClick={() => removeService(s.name)}
                          className="rounded-lg border border-slate-700 px-2 py-2 text-xs text-slate-300 hover:bg-slate-900"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nu ai adăugat servicii încă.</p>
              )}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={customServiceName}
                  onChange={(e) => setCustomServiceName(e.target.value)}
                  placeholder="Serviciu custom (nume)"
                />
                <input
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={customServiceDuration}
                  onChange={(e) => setCustomServiceDuration(e.target.value)}
                  inputMode="numeric"
                  placeholder="Durată (min)"
                />
                <div className="flex flex-col gap-2 md:flex-row">
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={customServicePrice}
                    onChange={(e) => setCustomServicePrice(e.target.value)}
                    inputMode="numeric"
                    placeholder="Preț (RON)"
                  />
                  <button
                    type="button"
                    onClick={addCustomService}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 md:whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </div>

              {errors['services'] ? <p className="text-xs text-rose-300">{errors['services']}</p> : null}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Specialități</p>
                <p className="mt-1 text-xs text-slate-500">Poți selecta mai multe + adăuga custom.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_SPECIALTIES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpecialty(s)}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs',
                      specialties.includes(s)
                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={customSpecialty}
                  onChange={(e) => setCustomSpecialty(e.target.value)}
                  placeholder="Specialitate custom"
                />
                <button
                  type="button"
                  onClick={addCustomSpecialty}
                  className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 md:whitespace-nowrap"
                >
                  Add
                </button>
              </div>
              {specialties.length > 0 ? (
                <p className="text-xs text-slate-500">
                  Selectate: <span className="text-slate-200">{specialties.join(', ')}</span>
                </p>
              ) : null}
              {errors['specialties'] ? <p className="text-xs text-rose-300">{errors['specialties']}</p> : null}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-200">Google Business Profile (GBP)</p>
              <p className="text-xs text-slate-500">
                Scop: să obținem acces Manager/Owner ca să administrăm profilul. Verificarea poate dura (postcard/telefon/video).
              </p>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {(
                  [
                    { id: 'unknown', label: 'Nu știm încă' },
                    { id: 'yes', label: 'Are cont Google' },
                    { id: 'no', label: 'Nu are cont Google' },
                  ] as const
                ).map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setGbpHasGoogleAccount(x.id)}
                    className={clsx(
                      'rounded-lg border px-3 py-2 text-sm text-left',
                      gbpHasGoogleAccount === x.id
                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                    )}
                  >
                    {x.label}
                  </button>
                ))}
              </div>

              {gbpHasGoogleAccount === 'no' ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                  <div className="font-medium text-slate-200">Ajutor creare cont</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Îi ghidăm să creeze un cont Google dedicat business-ului.</li>
                    <li>După asta, ne invită în GBP la “People and access”.</li>
                  </ul>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Email Google client (dacă există)
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={clientGoogleAccountEmail}
                    onChange={(e) => setClientGoogleAccountEmail(e.target.value)}
                    placeholder="email@gmail.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Email operator (acces)
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={gbpOperatorEmail}
                    onChange={(e) => setGbpOperatorEmail(e.target.value)}
                    placeholder="operator@…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {(
                  [
                    { id: 'unknown', label: 'Metodă acces: necunoscut' },
                    { id: 'client_invite', label: 'Clientul ne invită (recomandat)' },
                    { id: 'we_request', label: 'Noi trimitem request (pe email)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGbpAccessMethod(m.id)}
                    className={clsx(
                      'rounded-lg border px-3 py-2 text-sm text-left',
                      gbpAccessMethod === m.id
                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-900',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                    checked={profileExists}
                    onChange={(e) => setProfileExists(e.target.checked)}
                  />
                  Profil existent
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600 disabled:opacity-50"
                    checked={profileClaimed}
                    disabled={!profileExists}
                    onChange={(e) => setProfileClaimed(e.target.checked)}
                  />
                  Claimed
                </label>
                <select
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={gbpVerificationExpected}
                  onChange={(e) => setGbpVerificationExpected(parseVerificationExpected(e.target.value))}
                >
                  <option value="unknown">Verificare: necunoscut</option>
                  <option value="postcard">Postcard</option>
                  <option value="phone">Telefon</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Link Maps (opțional)</label>
                <input
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  value={gbpMapsUrl}
                  onChange={(e) => setGbpMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/…"
                />
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">GBP (auto defaults + override)</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Categorii + descriere + appointment URL se pot deriva din specialități, locație și Cal.com.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary category</label>
                    {operatorAdvanced ? (
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={gbpPrimaryCategory}
                        onChange={(e) => setGbpPrimaryCategory(e.target.value)}
                        placeholder="Psiholog"
                      />
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                        {gbpPrimaryCategory || 'Psiholog'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Additional categories</label>
                    {operatorAdvanced ? (
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={gbpAdditionalCategoriesRaw}
                        onChange={(e) => setGbpAdditionalCategoriesRaw(e.target.value)}
                        placeholder={derivedGbpAdditionalCategories.join(', ') || 'Psihoterapeut, Consilier psihologic'}
                      />
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                        {(gbpAdditionalCategoriesRaw || derivedGbpAdditionalCategories.join(', ')) || '—'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Descriere (max 750)</label>
                  <textarea
                    className={clsx(
                      'min-h-24 w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm text-slate-100',
                      operatorAdvanced ? 'border-slate-700' : 'border-slate-800 opacity-90',
                    )}
                    value={gbpDescription}
                    onChange={(e) => operatorAdvanced && setGbpDescription(e.target.value)}
                    placeholder={derivedGbpDescription}
                    readOnly={!operatorAdvanced}
                  />
                  {derivedGbpDescription ? (
                    <p className="text-xs text-slate-500">
                      Default derivat: <span className="text-slate-300">{derivedGbpDescription}</span>
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Appointment URL (derived)</label>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 break-all font-mono">
                      {derivedCalAppointmentUrl ?? '—'}
                    </div>
                    <p className="text-[11px] text-slate-500">Se setează automat dacă avem Cal.com username.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Attributes (comma)</label>
                    {operatorAdvanced ? (
                      <input
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={gbpAttributesRaw}
                        onChange={(e) => setGbpAttributesRaw(e.target.value)}
                        placeholder={derivedGbpAttributes.join(', ') || 'Programări online, Consiliere psihologică'}
                      />
                    ) : (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                        {(gbpAttributesRaw || derivedGbpAttributes.join(', ')) || '—'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {profileExists && !profileClaimed ? (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">
                  Profilul există dar nu e “claimed”. Asta intră pe fluxul de revendicare/verificare (poate dura câteva zile).
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                <div className="font-medium text-slate-200">Note (flow)</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Clientul trebuie să aibă cont Google + acces de owner/manager.</li>
                  <li>Verificarea (postcard/telefon/video) poate dura zile; nu e bypass.</li>
                  <li>După ce avem manager access, unele acțiuni sunt blocate ~7 zile (Day 9+ gate).</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-200">Automatizare (Cal.com + WhatsApp)</h3>
              <p className="mt-1 text-sm text-slate-500">Setări operaționale. Cal.com poate fi folosit și fără website.</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-200">Automatizare</p>
              <p className="text-xs text-slate-500">
                Cal.com este o opțiune separată și puternică (programări automate). Merge și fără website (link direct),
                dar pe website îl putem integra mai elegant.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                    checked={useWhatsapp}
                    onChange={(e) => setUseWhatsapp(e.target.checked)}
                  />
                  WhatsApp (no-reply update-uri)
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-600"
                    checked={useCalcom}
                    onChange={(e) => setUseCalcom(e.target.checked)}
                  />
                  Cal.com (programări automate)
                </label>
              </div>

              {!useWhatsapp && !useCalcom ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                  <div className="font-medium text-slate-200">Baseline: GBP only</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>Ne concentrăm pe Google Business Profile + SEO local.</li>
                    <li>Lead-urile vin prin apel / mesaj / butoane GBP (fără booking automat).</li>
                  </ul>
                </div>
              ) : null}

              {useWhatsapp ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Număr WhatsApp (cu prefix)
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="ex: 40722…"
                  />
                  {errors['automation.whatsappNumber'] ? (
                    <p className="text-xs text-rose-300">{errors['automation.whatsappNumber']}</p>
                  ) : null}
                </div>
              ) : null}

              {useCalcom ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Cal.com username</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      value={calUsername}
                      onChange={(e) => setCalUsername(e.target.value)}
                      placeholder="ex: dr-maria-ionescu"
                    />
                    {errors['automation.calUsername'] ? (
                      <p className="text-xs text-rose-300">{errors['automation.calUsername']}</p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Format: <span className="font-mono text-slate-300">cal.com/{calUsername || 'username'}</span> ·
                      timezone: <span className="font-mono text-slate-300">Europe/Bucharest</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Tip: pentru no-reply notificări, putem folosi WhatsApp doar pentru update-uri booking (fără
                      conversații).
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Cal.com API key (debug)
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        value={calApiKey}
                        onChange={(e) => setCalApiKey(e.target.value)}
                        placeholder="Paste aici doar pentru test (nu se salvează)"
                        type={revealCalKey ? 'text' : 'password'}
                      />
                      <button
                        type="button"
                        onClick={() => setRevealCalKey((v) => !v)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
                      >
                        {revealCalKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      În debug preview, cheia este mascată implicit (se vede doar finalul).
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-slate-200">Cal.com (auto defaults + override)</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Default appointment URL se derivă din username. Event slugs se derivă din numele serviciilor (editabile).
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Appointment URL (derived)</label>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 break-all font-mono">
                        {(calAppointmentUrlOverride.trim() ? calAppointmentUrlOverride.trim() : derivedCalAppointmentUrl) ?? '—'}
                      </div>
                      {operatorAdvanced ? (
                        <div className="mt-2 space-y-1">
                          <label className="text-[11px] uppercase tracking-wide text-slate-500">
                            Override appointment URL (optional)
                          </label>
                          <input
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                            value={calAppointmentUrlOverride}
                            onChange={(e) => setCalAppointmentUrlOverride(e.target.value)}
                            placeholder={derivedCalAppointmentUrl ?? 'https://cal.com/username'}
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">Override este ascuns (Operator advanced).</p>
                      )}
                    </div>

                    {services.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Event slugs per serviciu</p>
                        <div className="space-y-2">
                          {services.map((s) => (
                            <div
                              key={s.name}
                              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 md:grid-cols-3 md:items-center"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-200">{s.name}</div>
                                <div className="text-xs text-slate-500">Default: {toSlug(s.name)}</div>
                              </div>
                              {operatorAdvanced ? (
                                <>
                                  <input
                                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                    value={calServiceSlugs[s.name] ?? ''}
                                    onChange={(e) =>
                                      setCalServiceSlugs((prev) => ({ ...prev, [s.name]: toSlug(e.target.value || s.name) }))
                                    }
                                    placeholder={toSlug(s.name)}
                                  />
                                  <select
                                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                    value={calMeetingModes[s.name] ?? 'both'}
                                    onChange={(e) =>
                                      setCalMeetingModes((prev) => ({
                                        ...prev,
                                        [s.name]:
                                          e.target.value === 'in_person' || e.target.value === 'online'
                                            ? e.target.value
                                            : 'both',
                                      }))
                                    }
                                  >
                                    <option value="both">In-person + online</option>
                                    <option value="in_person">Doar in-person</option>
                                    <option value="online">Doar online</option>
                                  </select>
                                </>
                              ) : (
                                <div className="md:col-span-2 text-xs text-slate-500">
                                  Auto: <span className="font-mono text-slate-300">{toSlug(s.name)}</span> · mode:{' '}
                                  <span className="font-mono text-slate-300">{calMeetingModes[s.name] ?? 'both'}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Keywords are internal-only; not displayed in the UI. */}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-200">Review payload (debug)</h3>
              <p className="mt-1 text-sm text-slate-500">
                Acesta este payload-ul final pe care îl vom conecta ulterior la Supabase + `scripting/`.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Servicii</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">{services.length}</div>
                <div className="mt-1 text-xs text-slate-500">cu preț + durată</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">SEO zone</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {supportedCity}
                  {supportedCity === 'București' && sector ? ` · ${sector}` : ''}
                  {detectedNeighborhood || neighborhood ? ` · ${detectedNeighborhood ?? neighborhood}` : ''}
                </div>
                {supportedCity === 'București' && metroStation ? (
                  <div className="mt-1 text-xs text-slate-500">metro: {metroStation}</div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">hyper-local (mapping)</div>
                )}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Automation</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {useCalcom ? 'Cal.com' : '—'}
                  {useWhatsapp ? (useCalcom ? ' + WhatsApp' : 'WhatsApp') : ''}
                  {!useCalcom && !useWhatsapp ? 'GBP only' : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500">timezone: Europe/Bucharest</div>
              </div>
            </div>

            {!validation.success ? (
              <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-4 text-sm text-rose-200">
                Payload invalid. Întoarce-te și corectează câmpurile.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 text-sm text-emerald-200">
                Payload valid (Zod).
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyJson()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Copy JSON
                </button>
                {/* Keywords are internal-only (not shown / copyable in UI). */}
              </div>
              <div className="text-xs text-slate-500">
                Cal key masked: <span className="font-mono text-slate-200">{maskSecret(calApiKey)}</span>
              </div>
            </div>

            {/* Keyword bundle removed from UI */}

            <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4">
              <pre className="text-xs text-emerald-200/90">
                {JSON.stringify(intakeMasked, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={isHydrated && step === 1}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-40"
          >
            ← Înapoi
          </button>

          <div className="flex items-center gap-3">
            {status ? <span className="text-xs text-slate-400">{status}</span> : null}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (!validateCurrentStep()) return
                  setStep((s) => Math.min(4, s + 1))
                }}
                className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-200"
              >
                Continuă →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
              >
                Restart
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

