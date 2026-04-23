import { ObjectId, type Collection, type Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb/client'

export type ToolsRunKind = 'dry' | 'real'
export type ToolsRunStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export const TOOLS_RUNS_COLLECTION = {
  dry: 'tools_runs_dry',
  real: 'tools_runs_real',
} as const

export const TOOLS_RUN_LOGS_COLLECTION = {
  dry: 'tools_run_logs_dry',
  real: 'tools_run_logs_real',
} as const

export type ToolsRunDoc = {
  _id: ObjectId
  orgId: string
  userId: string
  kind: ToolsRunKind
  scriptId: string
  scriptLabel: string
  status: ToolsRunStatus
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
  exitCode?: number | null
  errorSummary?: string | null
  params: Record<string, unknown>
  artifacts?: Record<string, unknown>
}

export type ToolsLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type ToolsLogStream = 'stdout' | 'stderr' | 'system'

export type ToolsRunLogDoc = {
  _id: ObjectId
  runId: ObjectId
  seq: number
  ts: Date
  level: ToolsLogLevel
  stream: ToolsLogStream
  message: string
}

let ensured: Promise<void> | null = null

async function ensureIndexes(db: Db) {
  await db.collection<ToolsRunLogDoc>(TOOLS_RUN_LOGS_COLLECTION.dry).createIndex({ runId: 1, seq: 1 })
  await db.collection<ToolsRunLogDoc>(TOOLS_RUN_LOGS_COLLECTION.real).createIndex({ runId: 1, seq: 1 })
  await db.collection<ToolsRunDoc>(TOOLS_RUNS_COLLECTION.dry).createIndex({ orgId: 1, createdAt: -1 })
  await db.collection<ToolsRunDoc>(TOOLS_RUNS_COLLECTION.real).createIndex({ orgId: 1, createdAt: -1 })
}

export async function getToolsDb() {
  const db = await getMongoDb()
  if (!ensured) ensured = ensureIndexes(db).catch(() => {})
  return db
}

export async function toolsRunsCollection(kind: ToolsRunKind): Promise<Collection<ToolsRunDoc>> {
  const db = await getToolsDb()
  return db.collection<ToolsRunDoc>(TOOLS_RUNS_COLLECTION[kind])
}

export async function toolsLogsCollection(kind: ToolsRunKind): Promise<Collection<ToolsRunLogDoc>> {
  const db = await getToolsDb()
  return db.collection<ToolsRunLogDoc>(TOOLS_RUN_LOGS_COLLECTION[kind])
}

