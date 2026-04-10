import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { OnboardClientForm } from '@/components/onboarding/onboard-client-form'

export default async function NewClientPage(props: { searchParams: Promise<{ org_id?: string }> }) {
  const searchParams = await props.searchParams
  const orgId = searchParams.org_id
  if (!orgId) redirect('/org')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await canMutateOrgData(supabase, orgId, user.id))) {
    redirect(`/org?org_id=${encodeURIComponent(orgId)}`)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Onboard client</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Create client + location + 10 keywords. You can run ingestion right after.
          </p>
        </div>
        <Link
          href={`/org?org_id=${encodeURIComponent(orgId)}`}
          className="text-sm underline underline-offset-4"
        >
          Back
        </Link>
      </div>

      <div className="mt-8 rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <OnboardClientForm orgId={orgId} />
      </div>
    </div>
  )
}
