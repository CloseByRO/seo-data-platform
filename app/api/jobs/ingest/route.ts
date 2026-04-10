import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { lastNDaysRange } from '@/lib/jobs/date-range'
import { startJobRun, finishJobRun } from '@/lib/jobs/job-runs'
import { ingestGscDaily } from '@/lib/jobs/ingest-gsc'
import { ingestGbpDaily } from '@/lib/jobs/ingest-gbp'
import { ingestSerpGrid } from '@/lib/jobs/ingest-serp-grid'
import { ingestJobBody } from '@/lib/validation/api'
import { zodErrorMessage } from '@/lib/validation/parse'

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

  const parsed = ingestJobBody.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 })
  }

  const body = parsed.data

  if (!(await canMutateOrgData(supabase, body.orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const range =
    body.startDate && body.endDate ? { startDate: body.startDate, endDate: body.endDate } : lastNDaysRange(3)

  const results: Record<string, { ok: boolean; skipped?: boolean; error?: string }> = {}

  function isSkippableConfigError(msg: string) {
    return (
      msg.startsWith('Missing org_integrations.gsc_site_url') ||
      msg.startsWith('Missing locations.gbp_location_id')
    )
  }

  {
    const jobRunId = await startJobRun({
      orgId: body.orgId,
      jobName: 'ingest_gsc_daily',
      params: { ...range, clientId: body.clientId },
    })
    try {
      await ingestGscDaily({ orgId: body.orgId, clientId: body.clientId, ...range })
      await finishJobRun({ jobRunId, status: 'success' })
      results.gsc = { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isSkippableConfigError(msg)) {
        await finishJobRun({ jobRunId, status: 'skipped', error: msg })
        results.gsc = { ok: true, skipped: true, error: msg }
      } else {
        await finishJobRun({ jobRunId, status: 'failed', error: msg })
        results.gsc = { ok: false, error: msg }
      }
    }
  }

  {
    const jobRunId = await startJobRun({
      orgId: body.orgId,
      jobName: 'ingest_gbp_daily',
      params: { ...range, locationId: body.locationId },
    })
    try {
      await ingestGbpDaily({ orgId: body.orgId, locationId: body.locationId, ...range })
      await finishJobRun({ jobRunId, status: 'success' })
      results.gbp = { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isSkippableConfigError(msg)) {
        await finishJobRun({ jobRunId, status: 'skipped', error: msg })
        results.gbp = { ok: true, skipped: true, error: msg }
      } else {
        await finishJobRun({ jobRunId, status: 'failed', error: msg })
        results.gbp = { ok: false, error: msg }
      }
    }
  }

  {
    const jobRunId = await startJobRun({
      orgId: body.orgId,
      jobName: 'ingest_serp_grid',
      params: { ...range, clientId: body.clientId, locationId: body.locationId, provider: 'dataforseo' },
    })
    try {
      await ingestSerpGrid({
        orgId: body.orgId,
        clientId: body.clientId,
        locationId: body.locationId,
        provider: 'dataforseo',
        ...range,
      })
      await finishJobRun({ jobRunId, status: 'success' })
      results.serp = { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await finishJobRun({ jobRunId, status: 'failed', error: msg })
      results.serp = { ok: false, error: msg }
    }
  }

  return NextResponse.json({ ok: true, range, results })
}
