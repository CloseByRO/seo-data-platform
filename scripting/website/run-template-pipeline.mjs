#!/usr/bin/env node
/**
 * Unzip website-app-template → scripting/website/workspace/<runId>/website-dev,
 * optional npm ci + build, optional deploy (GitHub + Vercel Git-linked, or legacy CLI upload).
 *
 * Usage (from seo-data-platform repo root):
 *   node scripting/website/run-template-pipeline.mjs [options]
 *
 * Options:
 *   --run-id=<id>        Workspace folder name (default: random UUID)
 *   --skip-install       Do not run npm ci
 *   --skip-build         Do not run npm run build
 *   --skip-deploy        Do not run deploy
 *   --skip-cleanup       Keep workspace/<runId> on disk after finish (default: remove workspace after success)
 *   --prod               Production target (CLI upload only; Git flow uses Vercel default branch)
 *   --vercel-cli-upload  Force legacy `vercel deploy` file upload instead of GitHub + API (same as VERCEL_USE_CLI_UPLOAD=1)
 *
 * Environment:
 *   Git-linked deploy (default when GITHUB_TOKEN + GITHUB_OWNER are set):
 *     GITHUB_TOKEN, GITHUB_OWNER, VERCEL_TOKEN, VERCEL_ORG_ID
 *     GITHUB_REPO_EXISTS=reuse — if repo name exists, skip create and only push
 *   Legacy CLI upload (set VERCEL_USE_CLI_UPLOAD=1 or --vercel-cli-upload):
 *     VERCEL_TOKEN, VERCEL_ORG_ID (scope), etc.
 *   DEPLOY_CLIENT_ID — UUID; updates clients.website_deploy_url after deploy when possible
 *   After Git-linked project create: syncs env from process.env (see vercel-apply-client-env.mjs), then git redeploy.
 *   VERCEL_SKIP_ENV_SYNC=1 / VERCEL_SKIP_REDEPLOY=1 — skip steps; VERCEL_SYNC_EXTRA_KEYS — comma-separated extra keys to copy
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  parseVercelDeploymentUrl,
  sanitizeVercelProjectName,
} from './vercel-project-name.mjs'
import { createGitHubPrivateRepo } from './github-create-repo.mjs'
import { gitInitCommitPush } from './git-init-and-push.mjs'
import { createVercelGitLinkedProject } from './vercel-create-git-project.mjs'
import {
  applyEnvVarsToVercelProject,
  collectClientEnvEntries,
  normalizeSiteUrl,
} from './vercel-apply-client-env.mjs'
import { triggerGithubRedeploy } from './vercel-git-redeploy.mjs'
import { getGitHubDefaultBranch } from './github-repo-meta.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTING_DIR = __dirname
const ZIP_PATH = path.join(SCRIPTING_DIR, 'templates', 'website-app-template.zip')
const WORKSPACE_ROOT = path.join(SCRIPTING_DIR, 'workspace')
const REPO_ROOT = path.join(SCRIPTING_DIR, '..', '..')

/** Load `.env.local` / `.env` from repo root when keys are unset (standalone `node run-template-pipeline.mjs`). */
function loadRepoEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(REPO_ROOT, name)
    if (!fs.existsSync(p)) continue
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
}

function resolveVercelProjectSlug() {
  const fromEnv = process.env.VERCEL_PROJECT_SLUG
  if (fromEnv?.trim()) {
    return sanitizeVercelProjectName(fromEnv.trim())
  }
  const mergedPath = process.env.MERGED_CLIENT_PATH
  if (mergedPath && fs.existsSync(mergedPath)) {
    try {
      const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'))
      if (merged?.slug) {
        return sanitizeVercelProjectName(merged.slug)
      }
    } catch {
      /* ignore */
    }
  }
  return sanitizeVercelProjectName('closeby-site')
}

function parseArgs(argv) {
  const opts = {
    runId: null,
    skipInstall: false,
    skipBuild: false,
    skipDeploy: false,
    skipCleanup: false,
    prod: false,
    vercelCliUpload: false,
  }
  for (const a of argv) {
    if (a === '--skip-install') opts.skipInstall = true
    else if (a === '--skip-build') opts.skipBuild = true
    else if (a === '--skip-deploy') opts.skipDeploy = true
    else if (a === '--skip-cleanup') opts.skipCleanup = true
    else if (a === '--prod') opts.prod = true
    else if (a === '--vercel-cli-upload') opts.vercelCliUpload = true
    else if (a.startsWith('--run-id=')) opts.runId = a.slice('--run-id='.length)
  }
  return opts
}

function legacyVercelCliUploadEnabled(opts) {
  return (
    opts.vercelCliUpload ||
    process.env.VERCEL_USE_CLI_UPLOAD === '1' ||
    process.env.VERCEL_USE_CLI_UPLOAD === 'true'
  )
}

function wantsGitLinkedFlow() {
  return !!(process.env.GITHUB_TOKEN?.trim() && process.env.GITHUB_OWNER?.trim())
}

function runLegacyVercelCliDeploy(opts, appRoot) {
  const token = process.env.VERCEL_TOKEN
  if (!token) {
    console.warn(
      'VERCEL_TOKEN not set — skipping deploy. Set VERCEL_TOKEN or pass --skip-deploy.\n' +
        'Manual: cd ' +
        appRoot +
        ' && npx vercel deploy' +
        (opts.prod ? ' --prod' : '')
    )
    return null
  }

  const orgId = process.env.VERCEL_ORG_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!orgId) {
    console.warn(
      'VERCEL_ORG_ID not set — in non-interactive mode the Vercel CLI often requires --scope (team slug or team_… id). Add VERCEL_ORG_ID to .env.local (Team Settings in the dashboard).'
    )
  }

  const projectSlug = resolveVercelProjectSlug()
  console.log('Vercel project name (--name):', projectSlug)

  const args = ['vercel', 'deploy', '--yes', '--name', projectSlug]
  if (opts.prod) args.push('--prod')

  const env = { ...process.env, VERCEL_TOKEN: token }
  if (orgId && !projectId) {
    delete env.VERCEL_ORG_ID
    delete env.VERCEL_PROJECT_ID
    args.push('--scope', orgId)
  }

  console.log('Running npx ' + args.join(' ') + ' …')
  const r = spawnSync('npx', args, {
    cwd: appRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)

  if (r.status !== 0) {
    console.error('Vercel deploy failed')
    process.exit(r.status ?? 1)
  }

  const combined = (r.stdout || '') + (r.stderr || '')
  return parseVercelDeploymentUrl(combined)
}

async function pollDeploymentUrl(vercelToken, teamScope, projectId, maxAttempts = 36, delayMs = 5000) {
  const params = new URLSearchParams({ projectId, limit: '5' })
  if (teamScope.startsWith('team_')) {
    params.set('teamId', teamScope)
  } else if (teamScope) {
    params.set('slug', teamScope)
  }

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    })
    if (!res.ok) continue
    const data = await res.json()
    const dep = data.deployments?.find((d) => d.readyState === 'READY' && d.url)
    if (dep?.url) {
      return dep.url.startsWith('http') ? dep.url : `https://${dep.url}`
    }
    const any = data.deployments?.[0]
    if (any?.url && any.readyState !== 'ERROR') {
      return any.url.startsWith('http') ? any.url : `https://${any.url}`
    }
  }
  return null
}

async function runGitHubVercelLinkedDeploy(opts, appRoot) {
  const ghToken = process.env.GITHUB_TOKEN?.trim()
  const ghOwner = process.env.GITHUB_OWNER?.trim()
  const vercelToken = process.env.VERCEL_TOKEN?.trim()
  const teamScope = process.env.VERCEL_ORG_ID?.trim()

  if (!vercelToken) {
    console.error('Git-linked deploy requires VERCEL_TOKEN in .env.local')
    process.exit(1)
  }
  if (!teamScope) {
    console.error(
      'Git-linked deploy requires VERCEL_ORG_ID (Vercel team id or slug) for the Vercel API.'
    )
    process.exit(1)
  }

  const repoName = resolveVercelProjectSlug()
  const reuseIfExists =
    process.env.GITHUB_REPO_EXISTS === 'reuse' || process.env.GITHUB_REPO_EXISTS === 'true'

  console.log('Creating private GitHub repo:', `${ghOwner}/${repoName}`)
  const created = await createGitHubPrivateRepo({
    token: ghToken,
    owner: ghOwner,
    repoName,
    reuseIfExists,
  })
  if (!created.ok) {
    console.error(created.error)
    if (created.status === 422 || created.status === 409) {
      console.error(
        'Hint: if the repo already exists and is empty, set GITHUB_REPO_EXISTS=reuse in .env.local and retry.'
      )
    }
    process.exit(1)
  }

  const fullName = created.fullName
  console.log('Pushing to GitHub:', fullName)
  try {
    gitInitCommitPush({
      appRoot,
      owner: ghOwner,
      repoName,
      token: ghToken,
      branch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
    })
  } catch (e) {
    console.error('git init/push failed:', e instanceof Error ? e.message : e)
    process.exit(1)
  }

  console.log('Creating Vercel project linked to GitHub:', fullName)
  const vc = await createVercelGitLinkedProject({
    vercelToken,
    teamScope,
    projectName: repoName,
    githubRepoFullName: fullName,
  })
  if (!vc.ok) {
    console.error(vc.error)
    if (vc.status === 400 || vc.status === 403) {
      console.error(
        'Hint: connect the Vercel team to GitHub (Vercel dashboard → Team Settings → Git) and grant access to this repository.'
      )
    }
    process.exit(1)
  }

  const projectId = vc.project?.id
  let deployUrl = vc.deployUrl

  if (projectId && process.env.VERCEL_SKIP_ENV_SYNC !== '1') {
    if (!deployUrl) {
      console.log('Waiting for initial deployment URL (NEXT_PUBLIC_SITE_URL)…')
      deployUrl = await pollDeploymentUrl(vercelToken, teamScope, projectId)
    }

    const entries = collectClientEnvEntries(process.env, {
      clientSlug: repoName,
      deployUrl,
    })
    if (!entries.some((e) => e.key === 'NEXT_PUBLIC_SITE_URL')) {
      console.warn(
        'NEXT_PUBLIC_SITE_URL not set: add it to repo .env.local or wait until a deployment URL exists after redeploy.'
      )
    }
    console.log('Syncing env to Vercel project (keys only):', entries.map((e) => e.key).join(', '))
    const applied = await applyEnvVarsToVercelProject({
      vercelToken,
      teamScope,
      projectId,
      items: entries,
    })
    if (!applied.ok) {
      console.error(applied.error)
      process.exit(1)
    }
    console.log(`Vercel env: upserted ${applied.created} variable(s).`)

    if (process.env.VERCEL_SKIP_REDEPLOY !== '1') {
      const ref =
        (await getGitHubDefaultBranch({ token: ghToken, owner: ghOwner, repo: repoName })) ||
        process.env.GITHUB_DEFAULT_BRANCH ||
        'main'
      console.log('Redeploying from Git (ref:', ref + ') so new env applies…')
      const rd = await triggerGithubRedeploy({
        vercelToken,
        teamScope,
        projectId,
        projectName: repoName,
        githubOrg: ghOwner,
        githubRepo: repoName,
        ref,
      })
      if (!rd.ok) {
        console.error(rd.error)
        console.error(
          'Env was saved; trigger a redeploy from the Vercel dashboard if the build still lacks secrets.'
        )
      } else if (rd.url) {
        const prev = deployUrl ? normalizeSiteUrl(deployUrl) : ''
        const next = normalizeSiteUrl(rd.url)
        if (next && next !== prev) {
          const patch = await applyEnvVarsToVercelProject({
            vercelToken,
            teamScope,
            projectId,
            items: [{ key: 'NEXT_PUBLIC_SITE_URL', value: next }],
          })
          if (!patch.ok) {
            console.warn('Could not patch NEXT_PUBLIC_SITE_URL:', patch.error)
          }
        }
        deployUrl = rd.url
        console.log('Redeploy URL:', rd.url)
      }
    } else {
      console.log('VERCEL_SKIP_REDEPLOY=1 — skipping redeploy.')
    }
  } else if (!projectId) {
    console.warn('Vercel project response missing id; skipping env sync.')
  } else {
    console.log('VERCEL_SKIP_ENV_SYNC=1 — skipping env sync and redeploy.')
  }

  if (!deployUrl && projectId) {
    console.log('Waiting for deployment URL…')
    deployUrl = await pollDeploymentUrl(vercelToken, teamScope, projectId)
  }
  if (deployUrl) {
    console.log('Deployment URL:', deployUrl)
  } else {
    console.warn(
      'Could not resolve deployment URL yet. Check the Vercel dashboard for the new project.'
    )
  }

  return deployUrl
}

async function saveDeployUrlIfNeeded(deployUrl) {
  const clientId = process.env.DEPLOY_CLIENT_ID?.trim()
  if (clientId && deployUrl) {
    const { saveClientDeployUrl } = await import('./save-client-deploy-url.mjs')
    await saveClientDeployUrl(clientId, deployUrl)
  } else if (clientId && !deployUrl) {
    console.warn('Could not resolve deployment URL; skipping clients.website_deploy_url update')
  }
}

async function main() {
  loadRepoEnvFiles()
  const opts = parseArgs(process.argv.slice(2))
  const runId = opts.runId || randomUUID()
  const runWorkspace = path.join(WORKSPACE_ROOT, runId)
  const appRoot = path.join(runWorkspace, 'website-dev')

  if (!fs.existsSync(ZIP_PATH)) {
    console.error(`Missing template zip. Run: node scripting/website/build-template-zip.mjs\n  Expected: ${ZIP_PATH}`)
    process.exit(1)
  }

  fs.mkdirSync(runWorkspace, { recursive: true })
  console.log(`Unzipping → ${runWorkspace}`)
  execFileSync('unzip', ['-q', '-o', ZIP_PATH, '-d', runWorkspace], { stdio: 'inherit' })

  if (!fs.existsSync(path.join(appRoot, 'package.json'))) {
    console.error(`Expected ${appRoot}/package.json after unzip`)
    process.exit(1)
  }

  const postUnzip = path.join(SCRIPTING_DIR, 'hooks', 'post-unzip.mjs')
  if (fs.existsSync(postUnzip)) {
    console.log('Running hooks/post-unzip.mjs…')
    execFileSync(process.execPath, [postUnzip, appRoot, runId], {
      cwd: SCRIPTING_DIR,
      stdio: 'inherit',
    })
  }

  if (!opts.skipInstall) {
    console.log('Running npm ci…')
    execFileSync('npm', ['ci'], { cwd: appRoot, stdio: 'inherit' })
  }

  if (!opts.skipBuild) {
    console.log('Running npm run build…')
    execFileSync('npm', ['run', 'build'], { cwd: appRoot, stdio: 'inherit' })
  }

  if (!opts.skipDeploy) {
    const legacy = legacyVercelCliUploadEnabled(opts)
    const gitFlow = wantsGitLinkedFlow()

    if (gitFlow && !legacy) {
      const deployUrl = await runGitHubVercelLinkedDeploy(opts, appRoot)
      await saveDeployUrlIfNeeded(deployUrl)
    } else if (legacy) {
      const deployUrl = runLegacyVercelCliDeploy(opts, appRoot)
      await saveDeployUrlIfNeeded(deployUrl)
    } else if (process.env.VERCEL_TOKEN?.trim()) {
      console.error(
        'Configure Git-linked deploy: set GITHUB_TOKEN and GITHUB_OWNER in repo-root .env.local.\n' +
          '- If you deploy under the CloseBy GitHub org: set GITHUB_OWNER=CloseBy and use a token that can create private repos in that org.\n' +
          '- Ensure your Vercel team is connected to GitHub and granted access to repos under that owner (Vercel dashboard → Team Settings → Git).\n\n' +
          'Alternative: set VERCEL_USE_CLI_UPLOAD=1 (or pass --vercel-cli-upload) for legacy `vercel deploy` upload.'
      )
      process.exit(1)
    } else {
      console.warn(
        'VERCEL_TOKEN not set — skipping deploy. Set VERCEL_TOKEN or pass --skip-deploy.'
      )
    }
  }

  if (!opts.skipCleanup) {
    console.log(`Cleaning up ${runWorkspace}`)
    fs.rmSync(runWorkspace, { recursive: true, force: true })
  } else {
    console.log(`Kept workspace: ${runWorkspace}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
