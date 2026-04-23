import { MongoClient, type Db } from 'mongodb'

const DEFAULT_DB = 'seo_data_platform'

function resolveDbName(): string {
  return process.env.MONGODB_DB?.trim() || DEFAULT_DB
}

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined
}

export function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim()
  if (!uri) throw new Error('MongoDB: missing MONGODB_URI')

  if (!globalThis.__mongoClientPromise) {
    // Atlas TLS handshake errors can happen in some local environments (missing CA bundle, middlebox/proxy, etc).
    // For local debugging only, you can set `MONGODB_TLS_INSECURE=1` to bypass cert validation.
    const tlsInsecure = process.env.MONGODB_TLS_INSECURE === '1'
    const serverSelectionTimeoutMS = process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS
      ? Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS)
      : 10_000

    const client = new MongoClient(uri, {
      tlsInsecure,
      serverSelectionTimeoutMS: Number.isFinite(serverSelectionTimeoutMS) ? serverSelectionTimeoutMS : 10_000,
    })
    globalThis.__mongoClientPromise = client.connect()
  }
  return globalThis.__mongoClientPromise
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient()
  return client.db(resolveDbName())
}

