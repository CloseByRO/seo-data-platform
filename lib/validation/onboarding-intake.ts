import { z } from 'zod'
import { ROMANIAN_COUNTIES } from '@/lib/romania/counties'

const phoneRaw = z
  .string()
  .trim()
  .min(1, 'Telefonul este obligatoriu')
  .max(50)
  .refine((v) => /^[0-9+\s()\-]+$/.test(v), 'Telefon invalid')
  .refine((v) => {
    const digits = v.replace(/[^\d]/g, '')
    // RO mobile/landline: 0XXXXXXXXX (10 digits) or 40XXXXXXXXX (11 digits)
    if (digits.length === 10 && digits.startsWith('0')) return true
    if (digits.length === 11 && digits.startsWith('40')) return true
    return false
  }, 'Telefon invalid (format RO)')

const domain = z
  .string()
  .trim()
  .min(1, 'Domeniul este obligatoriu')
  .max(255)
  .refine((v) => !/^https?:\/\//i.test(v), 'Introdu doar domeniul (fără http/https)')
  .refine((v) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), 'Domeniu invalid')

const urlOptional = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))
  .refine((v) => {
    if (!v) return true
    try {
      const u = new URL(v)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }, 'URL invalid')

const priceRon = z
  .number({ message: 'Preț invalid' })
  .int('Preț invalid')
  .min(1, 'Preț invalid')
  .max(50_000, 'Preț prea mare')

const serviceSlug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), 'Slug invalid')

export const onboardingIntakeSchema = z
  .object({
    orgId: z.string().uuid(),
    debugOnly: z.literal(true),

    client: z.object({
      displayName: z.string().trim().min(2, 'Numele este obligatoriu').max(500),
      legalType: z.enum(['CIP', 'SRL', 'CLINICA']).optional(),
      email: z.string().trim().email('Email invalid').max(500),
      phone: phoneRaw,
    }),

    location: z.object({
      addressText: z.string().trim().min(5, 'Adresa este obligatorie').max(2000),
      placeId: z.string().trim().min(1, 'Selectează o sugestie Google Places').max(1000),
      lat: z.number().finite(),
      lng: z.number().finite(),
      county: z.enum(ROMANIAN_COUNTIES as unknown as [string, ...string[]], {
        message: 'Județ invalid (selectează o adresă din Google Places)',
      }),
      sector: z.string().trim().max(50).optional(),
      neighborhood: z.string().trim().max(120).optional(),
      countyRaw: z.string().trim().max(200).optional(),
      locality: z.string().trim().max(200).optional(),
    }),

    availability: z.object({
      openingHours: z
        .array(
          z.object({
            dayOfWeek: z.array(z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])).min(1),
            opens: z.string().regex(/^\d{2}:\d{2}$/, 'Ora invalidă (HH:MM)'),
            closes: z.string().regex(/^\d{2}:\d{2}$/, 'Ora invalidă (HH:MM)'),
          }),
        )
        .min(1),
    }),

    media: z.object({
      heroImageName: z.string().trim().max(300).optional(),
      galleryImageNames: z.array(z.string().trim().max(300)).max(3).default([]),
    }),

    website: z.object({
      wantsWebsite: z.boolean(),
      languageMode: z.enum(['ro', 'ro_en']),
      otherLanguagesNotes: z.string().trim().max(500).optional(),
      hasOldWebsite: z.boolean(),
      oldWebsiteUrl: urlOptional,
      reuseOldWebsiteContent: z.boolean().default(false),
      domain: domain.optional(),
      wantsDomainMigration: z.boolean(),
      dnsAccessAvailable: z.boolean().optional(),
    }),

    services: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(200),
          slug: serviceSlug,
          durationMinutes: z.number().int().min(30, 'Durata minimă este 30 minute').max(120, 'Durata maximă este 120 minute'),
          priceRon: priceRon,
        }),
      )
      .min(1, 'Selectează cel puțin un serviciu'),

    specialties: z.array(z.string().trim().min(2).max(120)).min(1, 'Selectează cel puțin o specialitate'),

    automation: z.object({
      useWhatsapp: z.boolean().default(false),
      useCalcom: z.boolean().default(false),
      whatsappNumber: z.string().trim().max(50).optional(),
      calUsername: z
        .string()
        .trim()
        .max(200)
        .optional()
        .refine((v) => !v || (!v.includes('@') && !/\s/.test(v)), 'Username Cal.com invalid (fără @ și fără spații)'),
      calApiKey: z.string().trim().max(500).optional(),
      timezone: z.literal('Europe/Bucharest'),
    }),

    calcom: z.object({
      appointmentUrl: urlOptional,
      serviceEventSlugs: z
        .array(
          z.object({
            serviceName: z.string().trim().min(2).max(200),
            eventSlug: z.string().trim().min(1).max(200),
          }),
        )
        .max(50)
        .default([]),
      meetingModeByService: z
        .array(
          z.object({
            serviceName: z.string().trim().min(2).max(200),
            mode: z.enum(['in_person', 'online', 'both']),
          }),
        )
        .max(50)
        .default([]),
    }),

    gbp: z.object({
      hasGoogleAccount: z.enum(['yes', 'no', 'unknown']).default('unknown'),
      accessMethod: z.enum(['client_invite', 'we_request', 'unknown']).default('unknown'),
      clientGoogleAccountEmail: z.string().trim().email('Email Google invalid').max(500).optional(),
      status: z.enum(['pending', 'invited', 'accepted', 'live']).default('pending'),
      profileExists: z.boolean(),
      profileClaimed: z.boolean().optional(),
      mapsUrl: urlOptional,
      placeId: z.string().trim().max(300).optional(),
      operatorAccessEmail: z.string().trim().email('Email operator invalid').max(500).optional(),
      verificationExpected: z.enum(['unknown', 'postcard', 'phone', 'video']).default('unknown'),

      primaryCategory: z.string().trim().min(2).max(100).default('Psiholog'),
      additionalCategories: z.array(z.string().trim().min(2).max(100)).max(5).default([]),
      description: z.string().trim().max(750).optional(),
      appointmentUrl: urlOptional,
      attributes: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
    }),

    websiteContent: z.object({
      paymentMethods: z.array(z.enum(['cash', 'bank_transfer', 'card', 'revolut', 'insurance'])).default([
        'cash',
        'bank_transfer',
      ]),
      cancellationPolicy: z.string().trim().max(1200).optional(),
      faqs: z
        .array(
          z.object({
            question: z.string().trim().min(5).max(200),
            answer: z.string().trim().min(5).max(1200),
          }),
        )
        .max(12)
        .default([]),
      nearbyTransport: z.array(z.string().trim().min(2).max(120)).max(12).default([]),
      parkingNotes: z.string().trim().max(500).optional(),
      privacyPolicyUrl: urlOptional,
    }),

    // Keep keywords internal-only (not shown in UI). Seeds still exist for DataForSEO pipeline.
    keywords: z
      .object({
        seedKeywords: z.array(z.string().trim().min(2).max(200)).min(5).max(30),
        approvedByOperator: z.boolean(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    // Services: enforce unique slugs + required price/duration already validated above.
    const slugs = new Set<string>()
    for (let i = 0; i < val.services.length; i++) {
      const s = val.services[i]
      if (slugs.has(s.slug)) {
        ctx.addIssue({ code: 'custom', path: ['services', i, 'slug'], message: 'Slug duplicat' })
      }
      slugs.add(s.slug)
    }

    if (val.gbp.accessMethod === 'we_request' && !val.gbp.clientGoogleAccountEmail) {
      ctx.addIssue({
        code: 'custom',
        path: ['gbp', 'clientGoogleAccountEmail'],
        message: 'Email-ul Google al clientului este obligatoriu când noi cerem acces (we_request)',
      })
    }

    if (val.gbp.accessMethod !== 'unknown' && !val.gbp.operatorAccessEmail) {
      ctx.addIssue({
        code: 'custom',
        path: ['gbp', 'operatorAccessEmail'],
        message: 'Completează email-ul operatorului (acces GBP)',
      })
    }

    if (val.website.wantsWebsite && val.website.hasOldWebsite && !val.website.oldWebsiteUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['website', 'oldWebsiteUrl'],
        message: 'Completează URL-ul site-ului vechi',
      })
    }
    if (val.website.wantsWebsite && val.website.wantsDomainMigration && !val.website.domain) {
      ctx.addIssue({
        code: 'custom',
        path: ['website', 'domain'],
        message: 'Completează domeniul pentru migrare',
      })
    }
    if (val.automation.useWhatsapp && !(val.automation.whatsappNumber ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['automation', 'whatsappNumber'],
        message: 'Completează numărul WhatsApp',
      })
    }
    if (val.automation.useCalcom && !(val.automation.calUsername ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['automation', 'calUsername'],
        message: 'Completează username-ul Cal.com',
      })
    }
    if (val.automation.useCalcom && val.automation.calUsername && val.automation.calUsername.includes('@')) {
      ctx.addIssue({
        code: 'custom',
        path: ['automation', 'calUsername'],
        message: 'Cal.com username nu poate fi email (fără @)',
      })
    }

    if (val.website.wantsWebsite && val.websiteContent.privacyPolicyUrl) {
      // already validated by urlOptional; keep for future conditional rules
    }

    if (val.automation.useCalcom && val.calcom.appointmentUrl && !val.calcom.appointmentUrl.trim()) {
      ctx.addIssue({ code: 'custom', path: ['calcom', 'appointmentUrl'], message: 'URL Cal.com invalid' })
    }
  })

export type OnboardingIntake = z.infer<typeof onboardingIntakeSchema>

