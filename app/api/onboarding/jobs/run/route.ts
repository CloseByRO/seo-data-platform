import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runOnboardingPipelineForIntake } from '@/lib/onboarding/pipeline'

function requireCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return { ok: false as const, error: 'Missing CRON_SECRET' }
  const got = request.headers.get('x-cron-secret')?.trim()
  if (!got || got !== secret) return { ok: false as const, error: 'Forbidden' }
  return { ok: true as const }
}

export async function POST(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })

  let raw: unknown = undefined
  try {
    raw = await request.json()
  } catch {
    // allow empty body
  }
  const body =
    raw && typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const intakeId = typeof body.intakeId === 'string' ? body.intakeId : undefined
  const limit = typeof body.limit === 'number' ? Math.max(1, Math.min(20, body.limit)) : 5

  if (intakeId) {
    const r = await runOnboardingPipelineForIntake({ intakeId })
    return NextResponse.json(r)
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: rows, error } = await admin
    .from('onboarding_intakes')
    .select('id')
    .neq('status', 'done')
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const r of rows ?? []) {
    if (!r?.id) continue
    results.push(await runOnboardingPipelineForIntake({ intakeId: r.id }))
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}

