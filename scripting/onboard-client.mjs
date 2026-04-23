#!/usr/bin/env node
/**
 * Client onboarding orchestrator (website phase today; Cal.com stubbed).
 *
 * Steps:
 *  1. Generate merged ClientConfig JSON (TOON + Claude + merge) → website/workspace/onboarding/<runId>/merged-client.json
 *  2. Require scripting/website/templates/website-app-template.zip (commit artifact; do not build from an external app in CI)
 *  3. Unzip, hooks/post-unzip.mjs copies merged JSON, npm ci, build, deploy (GitHub private repo + Vercel Git API by default, or legacy `vercel deploy` with --vercel-cli-upload / VERCEL_USE_CLI_UPLOAD=1)
 *
 * Usage (from seo-data-platform repo root):
 *   node scripting/onboard-client.mjs [--dry-run] [--skip-deploy] [--prod] [--keep-workspace] [--vercel-cli-upload] [--run-id=uuid] [--toon=path] [--client-id=uuid]
 *
 * Env: see .env.local.example (ANTHROPIC_*, CLOSEBY_USE_FILE_PROMPT, VERCEL_TOKEN, …)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  repoRoot,
  websiteScriptingDir,
  onboardingMergedPath,
  tsxCliPath,
  runWithToonScriptPath,
} from './website/generation/paths.mjs'
import { sanitizeVercelProjectName } from './website/vercel-project-name.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      let v = m[2]
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      process.env[m[1]] = v
    }
  }
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    skipDeploy: false,
    prod: false,
    keepWorkspace: false,
    runId: null,
    toon: null,
    clientId: null,
    vercelCliUpload: false,
  }
  for (const a of argv) {
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--skip-deploy') opts.skipDeploy = true
    else if (a === '--prod') opts.prod = true
    else if (a === '--keep-workspace') opts.keepWorkspace = true
    else if (a === '--vercel-cli-upload') opts.vercelCliUpload = true
    else if (a.startsWith('--run-id=')) opts.runId = a.slice('--run-id='.length)
    else if (a.startsWith('--toon=')) opts.toon = a.slice('--toon='.length)
    else if (a.startsWith('--client-id=')) opts.clientId = a.slice('--client-id='.length)
  }
  return opts
}

async function runCalcomPhase() {
  const cal = path.join(__dirname, 'calcom/index.mjs')
  if (fs.existsSync(cal)) {
    const { runCalcomOnboarding } = await import(cal)
    await runCalcomOnboarding()
  }
}

async function main() {
  loadEnvFile(path.join(repoRoot, '.env.local'))
  loadEnvFile(path.join(repoRoot, '.env'))

  const opts = parseArgs(process.argv.slice(2))
  // Dry-run should be safe + fast: generate merged JSON and run minimal template steps.
  // (Build can fail due to template/runtime differences; avoid blocking operators during dry runs.)
  if (opts.dryRun) {
    opts.skipDeploy = true
  }
  const runId = opts.runId || randomUUID()
  const mergedOut = onboardingMergedPath(runId)
  const toonPath = opts.toon
    ? path.resolve(repoRoot, opts.toon)
    : path.join(websiteScriptingDir, 'templates/toon.example.json')

  if (!fs.existsSync(toonPath)) {
    console.error('TOON not found:', toonPath)
    process.exit(1)
  }

  const runner = runWithToonScriptPath
  if (!opts.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('Set ANTHROPIC_API_KEY or use --dry-run')
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(mergedOut), { recursive: true })

  console.log('Step 1/2: Generate merged client JSON…')
  const genArgs = [
    ...(opts.dryRun ? ['--dry-run'] : []),
    '--verbose',
    `--out=${mergedOut}`,
    ...(opts.clientId ? [`--client-id=${opts.clientId}`] : []),
    toonPath,
  ]
  const gen = spawnSync(process.execPath, [tsxCliPath(), runner, ...genArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env },
  })
  if (gen.status !== 0) {
    console.error('Generation failed')
    process.exit(gen.status ?? 1)
  }

  try {
    const merged = JSON.parse(fs.readFileSync(mergedOut, 'utf8'))
    const slug = merged?.slug
    process.env.VERCEL_PROJECT_SLUG = sanitizeVercelProjectName(
      typeof slug === 'string' ? slug : 'closeby-site'
    )
  } catch (e) {
    console.warn('Could not read merged JSON for Vercel project slug:', e)
    process.env.VERCEL_PROJECT_SLUG = sanitizeVercelProjectName('closeby-site')
  }

  if (opts.clientId) {
    process.env.DEPLOY_CLIENT_ID = opts.clientId
  } else {
    delete process.env.DEPLOY_CLIENT_ID
  }

  const zipPath = path.join(websiteScriptingDir, 'templates', 'website-app-template.zip')
  if (!fs.existsSync(zipPath)) {
    console.error(
      'Missing template zip:',
      zipPath,
      '\nAdd the checked-in artifact, or run npm run template:zip with WEBSITE_TEMPLATE_SOURCE set (maintainer-only).'
    )
    process.exit(1)
  }

  process.env.MERGED_CLIENT_PATH = path.resolve(mergedOut)
  console.log('Step 2/2: Template pipeline (unzip → hook → ci → build → deploy)…')
  const pipe = path.join(websiteScriptingDir, 'run-template-pipeline.mjs')
  const pipeArgs = [
    pipe,
    `--run-id=${runId}`,
    ...(opts.dryRun ? ['--skip-build'] : []),
    ...(opts.skipDeploy ? ['--skip-deploy'] : []),
    ...(opts.prod ? ['--prod'] : []),
    ...(opts.keepWorkspace ? ['--skip-cleanup'] : []),
    ...(opts.vercelCliUpload ? ['--vercel-cli-upload'] : []),
  ]
  const p = spawnSync(process.execPath, pipeArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      MERGED_CLIENT_PATH: process.env.MERGED_CLIENT_PATH,
      VERCEL_PROJECT_SLUG: process.env.VERCEL_PROJECT_SLUG,
      ...(process.env.DEPLOY_CLIENT_ID
        ? { DEPLOY_CLIENT_ID: process.env.DEPLOY_CLIENT_ID }
        : {}),
    },
  })
  if (p.status !== 0) {
    process.exit(p.status ?? 1)
  }

  if (!opts.keepWorkspace) {
    const onboardingDir = path.join(websiteScriptingDir, 'workspace', 'onboarding', runId)
    if (fs.existsSync(onboardingDir)) {
      fs.rmSync(onboardingDir, { recursive: true, force: true })
      console.log('Removed onboarding output:', onboardingDir)
    }
  }

  await runCalcomPhase().catch((e) => console.warn('Cal.com phase:', e))

  console.log('Onboarding website phase complete. runId=', runId)
  console.log('Merged JSON:', mergedOut)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
