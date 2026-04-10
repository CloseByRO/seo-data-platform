import type { SupabaseClient } from '@supabase/supabase-js'

/** Owner or admin of the platform operator org (CloseBy). */
export async function isPlatformOperatorAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: op } = await supabase
    .from('organizations')
    .select('id')
    .eq('is_platform_operator', true)
    .maybeSingle()

  const operatorOrgId = op?.id as string | undefined
  if (!operatorOrgId) return false

  const { data: m } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', operatorOrgId)
    .eq('user_id', userId)
    .maybeSingle()

  return Boolean(m && (m.role === 'owner' || m.role === 'admin'))
}

export async function isOrgMember(supabase: SupabaseClient, orgId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Write access: platform operator (CloseBy) owner/admin, and member of the target org.
 * Other orgs’ “owner/admin” roles do not grant mutation rights.
 */
export async function canMutateOrgData(supabase: SupabaseClient, orgId: string, userId: string): Promise<boolean> {
  if (!(await isPlatformOperatorAdmin(supabase, userId))) return false
  return isOrgMember(supabase, orgId, userId)
}
