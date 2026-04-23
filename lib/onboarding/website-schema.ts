import { z } from 'zod'

export const hexVariantSchema = z.enum(['a', 'b', 'c', 'd', 'e', 'f'])

export const layoutSchema = z.object({
  header: hexVariantSchema,
  hero: hexVariantSchema,
  proof: hexVariantSchema,
  about: hexVariantSchema,
  services: hexVariantSchema,
  reviews: hexVariantSchema,
  faq: hexVariantSchema,
  location: hexVariantSchema,
  gallery: hexVariantSchema,
})

export const seoSchema = z.object({
  metaTitle: z.string().max(70),
  metaDescription: z.string().max(200),
  keywords: z.array(z.string()).min(4).max(24),
})

export const contentBlockSchema = z.object({
  heroTitle: z.string().max(200),
  heroTitleAccent: z.string().max(120),
  heroSubtitle: z.string().max(600),
  heroCta: z.string().max(80),
  heroCtaSecondary: z.string().max(80),
  heroAvailability: z.string().max(200),
  aboutTitle: z.string().max(200),
  aboutEyebrow: z.string().max(80),
  aboutTitleLead: z.string().max(120),
  aboutTitleLine2: z.string().max(120),
  aboutPullQuote: z.string().max(500),
  servicesTitle: z.string().max(120),
  servicesSubtitle: z.string().max(400),
  faqTitle: z.string().max(120),
  faqEyebrow: z.string().max(80),
  faqSidebarLead: z.string().max(120),
  faqSidebarEmphasis: z.string().max(80),
  faqSidebarSubtitle: z.string().max(300),
  reviewsTitle: z.string().max(120),
  galleryTitle: z.string().max(120),
  gallerySubtitle: z.string().max(300),
  locationSaturdayNote: z.string().max(200),
  heroBadgeFreeSession: z.string().max(120),
  heroChips: z.array(z.string()).max(8).optional(),
})

export const faqItemSchema = z.object({
  question: z.string().max(400),
  answer: z.string().max(8000),
})

export const llmClientPayloadSchema = z.object({
  layout: layoutSchema,
  seo: seoSchema,
  content: contentBlockSchema,
  faqs: z.array(faqItemSchema).min(5).max(12),
})

export type LlmClientPayload = z.infer<typeof llmClientPayloadSchema>

