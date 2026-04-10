import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto/token-encryption'
import { canMutateOrgData } from '@/lib/rbac/server'

type GoogleTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
  id_token?: string
}

type GoogleUserInfo = {
  sub: string
  email?: string
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!code || !state) return NextResponse.json({ error: 'Missing code/state' }, { status: 400 })

  let orgId: string | undefined
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { orgId: string }
    orgId = parsed.orgId
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Missing Google OAuth env' }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!orgId || !(await canMutateOrgData(supabase, orgId, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json({ error: 'Token exchange failed', details: text }, { status: 400 })
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userInfoRes.ok) {
    const text = await userInfoRes.text()
    return NextResponse.json({ error: 'Userinfo failed', details: text }, { status: 400 })
  }

  const userInfo = (await userInfoRes.json()) as GoogleUserInfo

  const admin = createAdminClient()
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
  const scopes = (tokens.scope ?? '').split(' ').filter(Boolean)

  const existing = await admin
    .from('google_connections')
    .select('id, encrypted_refresh_token')
    .eq('org_id', orgId)
    .eq('google_subject', userInfo.sub)
    .maybeSingle()

  if (existing.data?.id) {
    const update: Record<string, unknown> = { scopes }
    if (encryptedRefresh) update.encrypted_refresh_token = encryptedRefresh

    const { error: upErr } = await admin.from('google_connections').update(update).eq('id', existing.data.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  } else {
    if (!encryptedRefresh) {
      return NextResponse.json(
        { error: 'Missing refresh token; retry connect with prompt=consent' },
        { status: 400 },
      )
    }

    const { error: insErr } = await admin.from('google_connections').insert({
      org_id: orgId,
      created_by_user_id: user.id,
      google_subject: userInfo.sub,
      scopes,
      encrypted_refresh_token: encryptedRefresh,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.redirect(new URL(`/org?org_id=${encodeURIComponent(orgId)}`, url.origin))
}
