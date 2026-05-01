import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth } from '@/lib/firebase-admin.js'
import { isAuthorizedInternalRequest } from '@/lib/internal-auth.js'
import { normalizePhone } from '@/lib/phone.js'
import { phoneLockKey, redisGet } from '@/lib/redis'

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_LOCK_API_TOKEN?.trim()
  if (!isAuthorizedInternalRequest(request, { expectedToken: expected })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    const idToken = typeof body?.idToken === 'string' ? body.idToken : ''
    const phoneRaw = typeof body?.phone === 'string' ? body.phone : ''
    if (!idToken) return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })

    const phone = normalizePhone(phoneRaw)
    if (!phone) return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })

    const auth = getFirebaseAdminAuth()
    const decoded = await auth.verifyIdToken(idToken)
    const decodedPhone = normalizePhone(decoded.phone_number ?? '')
    if (!decodedPhone || decodedPhone !== phone) {
      return NextResponse.json({ error: 'Phone verification failed' }, { status: 401 })
    }

    const hasRedis =
      (!!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN) ||
      (!!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN)
    if (!hasRedis) return NextResponse.json({ locked: false, reason: 'no_store' })

    const key = phoneLockKey(phone)
    const value = await redisGet(key)
    return NextResponse.json({ locked: !!value })
  } catch (error) {
    return NextResponse.json(
      { locked: false, error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    )
  }
}

