type UpstashResult<T> = { result: T }

const LOCK_TTL_SECONDS = 24 * 60 * 60

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url) throw new Error('Missing KV_REST_API_URL (or UPSTASH_REDIS_REST_URL)')
  if (!token) throw new Error('Missing KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN)')
  return { url: url.replace(/\/+$/, ''), token }
}

function normalizePhone(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const cleaned = trimmed.replace(/[^\d+]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
  return cleaned
}

async function redisFetch<T>(
  path: string,
  init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<T> {
  const { url, token } = getRedisConfig()
  const response = await fetch(`${url}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    body: init?.body,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Upstash request failed (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

export function phoneLockKey(rawPhone: string): string {
  const phone = normalizePhone(rawPhone)
  if (!phone) throw new Error('phoneLockKey: phone is required')
  return `lock:phone:${phone}`
}

export async function redisGet(key: string): Promise<string | null> {
  if (!key) throw new Error('redisGet: key is required')
  const data = await redisFetch<UpstashResult<string | null>>(`/get/${encodeURIComponent(key)}`)
  return data.result ?? null
}

export async function redisDel(key: string): Promise<number> {
  if (!key) throw new Error('redisDel: key is required')
  const data = await redisFetch<UpstashResult<number>>(`/del/${encodeURIComponent(key)}`)
  return Number(data.result ?? 0)
}

export async function redisSetIfNotExists(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  if (!key) throw new Error('redisSetIfNotExists: key is required')
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('redisSetIfNotExists: ttlSeconds must be > 0')
  }
  const val = typeof value === 'string' ? value : JSON.stringify(value)
  const path = `/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}/NX/EX/${encodeURIComponent(String(ttlSeconds))}`
  const data = await redisFetch<UpstashResult<string | null>>(path)
  return data.result === 'OK'
}

export async function checkAndLock(rawPhone: string, ttlSeconds = LOCK_TTL_SECONDS): Promise<{ allowed: boolean; key: string }> {
  const key = phoneLockKey(rawPhone)
  const allowed = await redisSetIfNotExists(
    key,
    {
      createdAt: new Date().toISOString(),
      source: 'seo-data-platform',
    },
    ttlSeconds,
  )
  return { allowed, key }
}

export async function deletePhoneLock(rawPhone: string): Promise<number> {
  const key = phoneLockKey(rawPhone)
  return redisDel(key)
}

export async function markIdempotent(key: string, ttlSeconds: number): Promise<boolean> {
  return redisSetIfNotExists(key, { at: new Date().toISOString() }, ttlSeconds)
}

