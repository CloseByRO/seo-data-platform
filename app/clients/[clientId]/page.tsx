import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { canMutateOrgData } from '@/lib/rbac/server'
import { ClientDetailPanel } from '@/components/clients/client-detail-panel'

function websiteUrl(primaryDomain: string | null) {
  if (!primaryDomain) return null
  const d = primaryDomain.trim()
  if (!d) return null
  if (d.startsWith('http://') || d.startsWith('https://')) return d
  return `https://${d}`
}

function mapsUrlFromPlaceId(placeId: string | null) {
  if (!placeId) return null
  return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`
}

function mapsUrlFromLatLng(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
}

export default async function ClientDetailPage(props: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ org_id?: string }>
}) {
  const { clientId } = await props.params
  const searchParams = await props.searchParams
  const orgId = searchParams.org_id
  if (!orgId) redirect('/org')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/org')

  const canEdit = await canMutateOrgData(supabase, orgId, user.id)

  const { data: client } = await supabase
    .from('clients')
    .select('id,org_id,display_name,client_slug,primary_domain,created_at')
    .eq('id', clientId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!client) redirect(`/clients?org_id=${encodeURIComponent(orgId)}`)

  const { data: locations } = await supabase
    .from('locations')
    .select('id,address_text,lat,lng,place_id,gbp_location_id,created_at')
    .eq('client_id', clientId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const { data: keywords } = await supabase
    .from('keywords')
    .select('id,keyword_raw,created_at')
    .eq('client_id', clientId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  const primaryLocation = locations?.[0] ?? null
  const website = websiteUrl(client.primary_domain ?? null)
  const maps =
    mapsUrlFromPlaceId(primaryLocation?.place_id ?? null) ??
    mapsUrlFromLatLng(primaryLocation?.lat ?? null, primaryLocation?.lng ?? null)
  const gbp = primaryLocation?.gbp_location_id
    ? `https://business.google.com/locations/l/${encodeURIComponent(primaryLocation.gbp_location_id)}`
    : null

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/clients?org_id=${encodeURIComponent(orgId)}`} className="text-sm underline underline-offset-4">
            Back to clients
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{client.display_name}</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {client.primary_domain ?? client.client_slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/${encodeURIComponent(client.id)}/${encodeURIComponent(primaryLocation?.id ?? '')}?org_id=${encodeURIComponent(orgId)}`}
            className={`rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30 ${
              primaryLocation?.id ? '' : 'pointer-events-none opacity-50'
            }`}
          >
            Open analytics
          </Link>
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] dark:border-white/15 dark:hover:bg-white/10"
            >
              Website
            </a>
          ) : null}
          {maps ? (
            <a
              href={maps}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] dark:border-white/15 dark:hover:bg-white/10"
            >
              Google Maps
            </a>
          ) : null}
          {gbp ? (
            <a
              href={gbp}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-all duration-150 ease-out hover:bg-black/[.04] hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] dark:border-white/15 dark:hover:bg-white/10"
            >
              GBP
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <ClientDetailPanel
          orgId={orgId}
          client={client}
          locations={locations ?? []}
          keywords={keywords ?? []}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}
