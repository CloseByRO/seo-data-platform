import { createAdminClient } from '@/lib/supabase/admin'

export async function startJobRun(params: { orgId: string; jobName: string; params?: unknown }) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('job_runs')
    .insert({
      org_id: params.orgId,
      job_name: params.jobName,
      status: 'running',
      params: params.params ?? {},
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

export async function finishJobRun(params: {
  jobRunId: string
  status: 'success' | 'failed' | 'skipped'
  error?: string
}) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('job_runs')
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      error: params.error ?? null,
    })
    .eq('id', params.jobRunId)

  if (error) throw error
}

