type DataForSeoTask<T> = { id?: string; status_code?: number; status_message?: string; result?: T[] }

export type DataForSeoOptions = {
  retries?: number
  retryDelayMs?: number
  timeoutMs?: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableHttp(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function jitter(ms: number) {
  const factor = 0.25
  const delta = ms * factor
  return Math.max(0, Math.round(ms - delta + Math.random() * (2 * delta)))
}

export async function dataForSeoRequest<T>(path: string, payload: unknown, opts: DataForSeoOptions = {}): Promise<T> {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) throw new Error('Missing DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD')

  const retries = opts.retries ?? 2
  const baseDelay = opts.retryDelayMs ?? 900
  const timeoutMs = opts.timeoutMs ?? 60_000

  const auth = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`https://api.dataforseo.com${path}`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        if (attempt < retries && isRetryableHttp(res.status)) {
          await sleep(jitter(baseDelay * Math.pow(2, attempt)))
          continue
        }
        throw new Error(`DataForSEO request failed: ${text}`)
      }

      const json = (await res.json()) as { tasks?: Array<DataForSeoTask<T>> }
      const task = json.tasks?.[0]
      if (!task) throw new Error('DataForSEO: missing tasks[0]')

      if (task.status_code && task.status_code !== 20000) {
        // Some plans intermittently return non-20000 with empty tasks; allow retry on generic transient states.
        const msg = `DataForSEO: ${task.status_code} ${task.status_message ?? ''}`.trim()
        if (attempt < retries && (task.status_code === 50000 || task.status_code === 50001)) {
          await sleep(jitter(baseDelay * Math.pow(2, attempt)))
          continue
        }
        throw new Error(msg)
      }

      return (task.result?.[0] as unknown as T) ?? (null as unknown as T)
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await sleep(jitter(baseDelay * Math.pow(2, attempt)))
        continue
      }
      throw e
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Math.floor(chunkSize))
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

