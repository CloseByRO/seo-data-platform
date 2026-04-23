import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { onboardingIntakeSchema } from '@/lib/validation/onboarding-intake'
import { zodErrorMessage } from '@/lib/validation/parse'
import { createAdminClient } from '@/lib/supabase/admin'
import { runOnboardingPipelineForIntake } from '@/lib/onboarding/pipeline'

type MaskablePayload = { automation?: { calApiKey?: string } }

function stripSecrets<T extends MaskablePayload>(payload: T): {
  safe: T
  secretHints: Record<string, unknown>
} {
  const clone = JSON.parse(JSON.stringify(payload)) as T
  const hints: Record<string, unknown> = {}
  const key = clone.automation?.calApiKey
  if (typeof key === 'string' && key.trim()) {
    hints.calApiKeyLast4 = key.trim().slice(-4)
    if (!clone.automation) clone.automation = {}
    delete (clone.automation as any).calApiKey
  }
  return { safe: clone, secretHints: hints }
}

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

  const parsed = onboardingIntakeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { safe, secretHints } = stripSecrets(body)
  const admin = createAdminClient()

  const { data: inserted, error } = await admin
    .from('onboarding_intakes')
    .insert({
      org_id: safe.orgId,
      created_by: user.id,
      status: 'received',
      payload: safe,
      artifacts: { secretHints },
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fire-and-forget trigger (best-effort). The cron/job runner can pick it up later.
  runOnboardingPipelineForIntake({ intakeId: inserted.id, orgId: safe.orgId }).catch(() => {})

  return NextResponse.json({ ok: true, intakeId: inserted.id })
}

