import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canAccessCloseByAdminApp } from '@/lib/rbac/server'
import { z } from 'zod'
import { zodErrorMessage } from '@/lib/validation/parse'

const templateTextParameterSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(1024),
})

const templateLocationParameterSchema = z.object({
  type: z.literal('location'),
  location: z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().min(1).max(500).optional(),
  }),
})

const templateParameterSchema = z.union([templateTextParameterSchema, templateLocationParameterSchema])

const templateComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  sub_type: z.enum(['quick_reply', 'url']).optional(),
  index: z.string().regex(/^\d+$/).optional(),
  parameters: z.array(templateParameterSchema).min(1).max(20),
})

const bodySchema = z.object({
  to: z.string().trim().optional(),
  templateName: z.string().trim().min(1).max(200).default('hello_world'),
  languageCode: z.string().trim().min(2).max(20).default('en_US'),
  components: z.array(templateComponentSchema).max(10).optional(),
})

function normalizeE164ToDigits(raw: string) {
  return raw.replace(/[^\d]/g, '')
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await canAccessCloseByAdminApp(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const defaultTo = process.env.WHATSAPP_TEST_PHONE_E164?.trim()

  if (!accessToken) return NextResponse.json({ error: 'Missing WHATSAPP_ACCESS_TOKEN' }, { status: 500 })
  if (!phoneNumberId) return NextResponse.json({ error: 'Missing WHATSAPP_PHONE_NUMBER_ID' }, { status: 500 })

  const toRaw = parsed.data.to?.trim() || defaultTo
  if (!toRaw) return NextResponse.json({ error: 'Missing recipient phone number (to)' }, { status: 400 })

  const to = normalizeE164ToDigits(toRaw)
  if (to.length < 10) return NextResponse.json({ error: 'Invalid recipient phone number' }, { status: 400 })

  const url = `https://graph.facebook.com/v25.0/${encodeURIComponent(phoneNumberId)}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: parsed.data.templateName,
        language: { code: parsed.data.languageCode },
        ...(parsed.data.components ? { components: parsed.data.components } : {}),
      },
    }),
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: 'WhatsApp send failed', status: res.status, response: json },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, to: toRaw, response: json })
}

