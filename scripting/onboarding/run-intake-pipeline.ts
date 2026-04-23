#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { onboardingIntakeSchema } from '../../lib/validation/onboarding-intake'
import { runOnboardingPipelineForIntake } from '../../lib/onboarding/pipeline'

function repoRootFromHere() {
  return path.resolve(__dirname, '..', '..')
}

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
}

function argValue(flag: string) {
  const argv = process.argv.slice(2)
  const eq = argv.find((a) => a.startsWith(`${flag}=`))
  if (eq) return eq.slice((`${flag}=`).length)
  const i = argv.indexOf(flag)
  if (i === -1) return undefined
  return argv[i + 1]
}

async function main() {
  const repoRoot = repoRootFromHere()
  loadEnvFile(path.join(repoRoot, '.env.local'))
  loadEnvFile(path.join(repoRoot, '.env'))

  const orgId = argValue('--org-id')
  const intakeIdArg = argValue('--intake-id')
  const intakeJsonArg = argValue('--intake-json')
  const dryRun = process.argv.includes('--dry-run')

  if (!orgId) {
    console.error('Missing --org-id')
    process.exit(1)
  }
  if (!intakeIdArg && !intakeJsonArg) {
    console.error('Provide --intake-id or --intake-json')
    process.exit(1)
  }

  let intakeId = intakeIdArg

  if (!intakeId && intakeJsonArg) {
    let raw: unknown
    try {
      raw = JSON.parse(intakeJsonArg)
    } catch {
      console.error('--intake-json must be valid JSON string')
      process.exit(1)
    }
    const parsed = onboardingIntakeSchema.safeParse(raw)
    if (!parsed.success) {
      console.error('Intake JSON validation failed:', parsed.error.flatten())
      process.exit(1)
    }
    const safe = parsed.data

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      process.exit(1)
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: inserted, error } = await supabase
      .from('onboarding_intakes')
      .insert({
        org_id: orgId,
        status: 'received',
        payload: safe,
        artifacts: { source: 'tools_script' },
      })
      .select('id')
      .single()

    if (error) {
      console.error('Insert onboarding_intakes failed:', error.message)
      process.exit(1)
    }
    intakeId = inserted.id
    console.log('Created intake:', intakeId)
  }

  const result = await runOnboardingPipelineForIntake({
    intakeId: intakeId!,
    orgId,
    dryRun,
  })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})

