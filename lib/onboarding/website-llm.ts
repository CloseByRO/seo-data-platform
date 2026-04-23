import Anthropic from '@anthropic-ai/sdk'
import { encode } from '@toon-format/toon'
import { llmClientPayloadSchema, type LlmClientPayload } from '@/lib/onboarding/website-schema'

const API_SYSTEM_MINIMAL = [
  'You are CloseBy Content Generator for psychology clinic websites in Romania.',
  'Input: TOON clinic data only. Do not ask questions.',
  'Output: call submit_client_content exactly once. No markdown.',
  'Constraints: dedupe seo.keywords/heroChips/faq questions; no invented reviews; no medical promises; consistent tu/dumneavoastra.',
].join('\n')

const BACKUP_PROMPT = [
  'You are CloseBy Content Generator — structured copywriter for psychology clinic websites in Romania.',
  'The user message is clinic data only, in TOON. Decode it as structured fields; do not ask for more input.',
  'CRITICAL: respond ONLY via submit_client_content. Must pass validation.',
  'Types: content is an object of strings (not markdown, not stringified JSON). faqs is array of {question,answer} (not inside content).',
  'SEO: metaTitle<=70 chars; metaDescription<=200 chars; keywords array 4-24 unique strings (prefer seoKeywordCandidates).',
  'Layout: keys header,hero,proof,about,services,reviews,faq,location,gallery; values a-f. Apply layoutOverride last if present.',
  'FAQs: 5-12 items; unique questions; avoid duplicate answers.',
  'Voice: warm, credible, empathetic. No mixed tu/dumneavoastra. YMYL: no diagnoses, no cure promises, no fake reviews.',
].join('\n')

function buildUserMessage(toon: unknown) {
  if (process.env.CLOSEBY_USE_BACKUP_PROMPT === '1') {
    return `${BACKUP_PROMPT}\n\n${encode(toon)}`
  }
  return encode(toon)
}

function extractToolInput(content: Array<any>) {
  for (const block of content) {
    if (block?.type === 'tool_use' && block?.name === 'submit_client_content') {
      return block.input
    }
  }
  throw new Error('Claude did not call submit_client_content')
}

function buildToolSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      layout: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          ['header', 'hero', 'proof', 'about', 'services', 'reviews', 'faq', 'location', 'gallery'].map((k) => [
            k,
            { type: 'string', enum: ['a', 'b', 'c', 'd', 'e', 'f'] },
          ])
        ),
        required: ['header', 'hero', 'proof', 'about', 'services', 'reviews', 'faq', 'location', 'gallery'],
      },
      seo: {
        type: 'object',
        additionalProperties: false,
        properties: {
          metaTitle: { type: 'string', maxLength: 70 },
          metaDescription: { type: 'string', maxLength: 200 },
          keywords: {
            type: 'array',
            minItems: 4,
            maxItems: 24,
            items: { type: 'string' },
          },
        },
        required: ['metaTitle', 'metaDescription', 'keywords'],
      },
      content: {
        type: 'object',
        additionalProperties: false,
        properties: {
          heroTitle: { type: 'string' },
          heroTitleAccent: { type: 'string' },
          heroSubtitle: { type: 'string' },
          heroCta: { type: 'string' },
          heroCtaSecondary: { type: 'string' },
          heroAvailability: { type: 'string' },
          heroBadgeFreeSession: { type: 'string' },
          heroChips: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          aboutTitle: { type: 'string' },
          aboutEyebrow: { type: 'string' },
          aboutTitleLead: { type: 'string' },
          aboutTitleLine2: { type: 'string' },
          aboutPullQuote: { type: 'string' },
          servicesTitle: { type: 'string' },
          servicesSubtitle: { type: 'string' },
          faqTitle: { type: 'string' },
          faqEyebrow: { type: 'string' },
          faqSidebarLead: { type: 'string' },
          faqSidebarEmphasis: { type: 'string' },
          faqSidebarSubtitle: { type: 'string' },
          reviewsTitle: { type: 'string' },
          galleryTitle: { type: 'string' },
          gallerySubtitle: { type: 'string' },
          locationSaturdayNote: { type: 'string' },
        },
        required: [
          'heroTitle',
          'heroTitleAccent',
          'heroSubtitle',
          'heroCta',
          'heroCtaSecondary',
          'heroAvailability',
          'aboutTitle',
          'aboutEyebrow',
          'aboutTitleLead',
          'aboutTitleLine2',
          'aboutPullQuote',
          'servicesTitle',
          'servicesSubtitle',
          'faqTitle',
          'faqEyebrow',
          'faqSidebarLead',
          'faqSidebarEmphasis',
          'faqSidebarSubtitle',
          'reviewsTitle',
          'galleryTitle',
          'gallerySubtitle',
          'locationSaturdayNote',
          'heroBadgeFreeSession',
        ],
      },
      faqs: {
        type: 'array',
        minItems: 5,
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
      },
    },
    required: ['layout', 'seo', 'content', 'faqs'],
  }
}

function repairToolPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const o = raw as Record<string, any>
  if (o.faqs === undefined && o.content && typeof o.content === 'object' && o.content !== null) {
    const c = o.content as Record<string, any>
    if (Array.isArray(c.faqs)) {
      o.faqs = c.faqs
      delete c.faqs
    }
  }
  return o
}

export async function generateWebsiteLlmPayload(args: { toon: unknown }): Promise<{
  payload: LlmClientPayload
  model: string
  usage: Record<string, number>
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

  const toolSchema = buildToolSchema()

  const client = new Anthropic({ apiKey })
  async function call(system: string) {
    return await client.messages.create({
      model,
      max_tokens: 1600,
      temperature: 0.4,
      system,
      messages: [{ role: 'user', content: buildUserMessage(args.toon) }],
      tools: [
        {
          name: 'submit_client_content',
          description:
            'submit_client_content: layout (a-f per section), seo { metaTitle, metaDescription, keywords }, content (hero/about/services/faq block strings + heroChips), faqs []. Use exactly once.',
          input_schema: toolSchema as any,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_client_content' },
    })
  }

  let resp = await call(API_SYSTEM_MINIMAL)
  let raw = repairToolPayload(extractToolInput(resp.content as any[]))
  let parsed = llmClientPayloadSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.message
    const missingFaqs = msg.includes('"path":[\n      "faqs"\n    ]') || msg.includes('["faqs"]')
    if (missingFaqs) {
      resp = await call(
        `${API_SYSTEM_MINIMAL}\nCRITICAL: Include faqs (5-12). The tool input MUST have top-level key "faqs" as an array.`
      )
      raw = repairToolPayload(extractToolInput(resp.content as any[]))
      parsed = llmClientPayloadSchema.safeParse(raw)
    }
  }
  if (!parsed.success) throw new Error(`Claude output failed validation: ${parsed.error.message}`)

  const u: any = (resp as any).usage
  const usage: Record<string, number> = {
    input_tokens: Number(u?.input_tokens) || 0,
    output_tokens: Number(u?.output_tokens) || 0,
  }
  if (u?.cache_creation_input_tokens != null) {
    usage.cache_creation_input_tokens = Number(u.cache_creation_input_tokens) || 0
  }
  if (u?.cache_read_input_tokens != null) {
    usage.cache_read_input_tokens = Number(u.cache_read_input_tokens) || 0
  }

  return { payload: parsed.data, model: resp.model ?? model, usage }
}

