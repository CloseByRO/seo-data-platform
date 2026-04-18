#!/usr/bin/env node
/**
 * Apply `supabase/migrations/*.sql` in numeric order using the `pg` driver (no `psql` binary required).
 *
 * Usage:
 *   npm run db:apply-migrations -- "postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres"
 *   npm run db:apply-migrations -- "--from=0008" "postgresql://..."
 *   DATABASE_URL="postgresql://..." npm run db:apply-migrations
 *
 * --from=NNNN  Only run migrations whose filename starts with NNNN_ (and all later files in sort order).
 *
 * URI: Supabase Dashboard → Project Settings → Database → Connection string → URI (direct).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
let uri = process.env.DATABASE_URL
let fromPrefix = ''
for (const a of argv) {
  if (a.startsWith('--from=')) {
    fromPrefix = a.slice('--from='.length).trim()
  } else if (a.startsWith('postgresql://') || a.startsWith('postgres://')) {
    uri = a
  }
}

if (!uri) {
  console.error('Usage: node supabase/apply-migrations.mjs [--from=0008] <postgres-uri>')
  console.error('   or: DATABASE_URL=<uri> node supabase/apply-migrations.mjs [--from=0008]')
  process.exit(1)
}

const placeholderPattern =
  /YOUR_(?:REF|PASSWORD|PROJECT_REF)|db\.YOUR[^a-z0-9]|<PROJECT_REF>|<DB_PASSWORD>|\[YOUR PROJECT REF\]/i
if (placeholderPattern.test(uri)) {
  console.error(
    'The connection string still contains documentation placeholders (e.g. YOUR_REF, YOUR_PASSWORD).',
  )
  console.error('Replace them with real values from: Supabase → Project Settings → Database → Connection string → URI.')
  process.exit(1)
}

const migDir = path.join(__dirname, 'migrations')
const files = fs
  .readdirSync(migDir)
  .filter((f) => /^\d{4}_/.test(f) && f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error(`No migrations found in ${migDir}`)
  process.exit(1)
}

let toRun = files
if (fromPrefix) {
  const needle = `${fromPrefix}_`
  const idx = files.findIndex((f) => f.startsWith(needle))
  if (idx === -1) {
    console.error(`No migration file starting with "${needle}" (use e.g. --from=0008)`)
    process.exit(1)
  }
  toRun = files.slice(idx)
  console.log(`Applying ${toRun.length} migration(s) starting at ${files[idx]}`)
}

const useSsl = uri.includes('supabase.co') || uri.includes('sslmode=require')
const client = new pg.Client({
  connectionString: uri,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
})

try {
  await client.connect()
  for (const f of toRun) {
    const full = path.join(migDir, f)
    const sql = fs.readFileSync(full, 'utf8')
    console.log('==>', f)
    await client.query(sql)
  }
  console.log(fromPrefix ? `Migrations from ${fromPrefix} onward applied.` : 'All migrations applied.')
} catch (err) {
  const e = /** @type {NodeJS.ErrnoException & { code?: string }} */ (err)
  if (e.code === 'ENOTFOUND') {
    console.error('DNS lookup failed for the database host. Use the exact host from your Supabase URI (db.<20-char-ref>.supabase.co), not a template string.')
  } else if (e.code === 'ECONNREFUSED') {
    console.error('Connection refused. Check host, port (5432 for direct), and that your IP is allowed if using network restrictions.')
  } else if (e.message?.includes('password authentication failed')) {
    console.error('Wrong database password. Copy the "Database password" you set for the project (or reset it in Project Settings → Database).')
  }
  console.error(err)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
