#!/usr/bin/env node
/**
 * Optional maintainer tool: pack a full Next app tree into website-app-template.zip.
 * Not used by onboard-client or production — set WEBSITE_TEMPLATE_SOURCE to your checkout when refreshing the zip.
 * Embeds `scripting/website/closeby` into `website-dev/closeby` and patches tsconfig/tailwind so the
 * template is self-contained (Vercel only deploys `website-dev`; monorepo `../../../closeby` is not uploaded).
 * Keep `closeby/` in parity with **closeby-demo-project** per `closeby/PARITY.md` when demo components change.
 *
 * Usage: from repo root: WEBSITE_TEMPLATE_SOURCE=/path/to/app node scripting/website/build-template-zip.mjs
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTING_DIR = __dirname

const TEMPLATE_SOURCE = process.env.WEBSITE_TEMPLATE_SOURCE
  ? path.resolve(process.env.WEBSITE_TEMPLATE_SOURCE)
  : null

const TEMPLATES_DIR = path.join(SCRIPTING_DIR, 'templates')
const ZIP_PATH = path.join(TEMPLATES_DIR, 'website-app-template.zip')
const STAGING_ROOT = path.join(SCRIPTING_DIR, '.template-staging')

const EXCLUDE_SEGMENTS = new Set(['node_modules', '.next', '.git', '.vercel', '.cursor'])

function shouldCopy(src, srcRoot) {
  const rel = path.relative(srcRoot, src)
  const segments = rel.split(path.sep).filter(Boolean)
  if (segments.some((s) => EXCLUDE_SEGMENTS.has(s))) return false
  const base = path.basename(src)
  if (base.startsWith('.env') && base !== '.env.local.example') return false
  if (base.endsWith('.tsbuildinfo')) return false
  return true
}

function patchTsconfig(jsonText) {
  const j = JSON.parse(jsonText)
  j.compilerOptions = j.compilerOptions ?? {}
  j.compilerOptions.paths = j.compilerOptions.paths ?? {}
  j.compilerOptions.paths['@closeby/*'] = ['./closeby/*']
  return `${JSON.stringify(j, null, 2)}\n`
}

function patchTailwind(source) {
  return source
    .replaceAll('../seo-data-platform/scripting/website/closeby/', './closeby/')
    .replaceAll('../../../closeby/', './closeby/')
}

function main() {
  if (!TEMPLATE_SOURCE || !fs.existsSync(TEMPLATE_SOURCE)) {
    console.error(
      'Set WEBSITE_TEMPLATE_SOURCE to the root of the Next app to pack (absolute path).'
    )
    process.exit(1)
  }

  fs.rmSync(STAGING_ROOT, { recursive: true, force: true })
  const destApp = path.join(STAGING_ROOT, 'website-dev')
  fs.mkdirSync(destApp, { recursive: true })

  fs.cpSync(TEMPLATE_SOURCE, destApp, {
    recursive: true,
    filter: (src) => shouldCopy(src, TEMPLATE_SOURCE),
  })

  const closebySrc = path.join(SCRIPTING_DIR, 'closeby')
  const closebyDest = path.join(destApp, 'closeby')
  if (fs.existsSync(closebySrc)) {
    fs.cpSync(closebySrc, closebyDest, {
      recursive: true,
      filter: (src) => shouldCopy(src, closebySrc),
    })
  } else {
    console.error('Missing CloseBy sources:', closebySrc)
    process.exit(1)
  }

  const tsconfigPath = path.join(destApp, 'tsconfig.json')
  fs.writeFileSync(tsconfigPath, patchTsconfig(fs.readFileSync(tsconfigPath, 'utf8')), 'utf8')

  const tailwindPath = path.join(destApp, 'tailwind.config.ts')
  if (fs.existsSync(tailwindPath)) {
    fs.writeFileSync(tailwindPath, patchTailwind(fs.readFileSync(tailwindPath, 'utf8')), 'utf8')
  }

  fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH)

  execFileSync('zip', ['-r', '-q', ZIP_PATH, 'website-dev'], {
    cwd: STAGING_ROOT,
    stdio: 'inherit',
  })

  fs.rmSync(STAGING_ROOT, { recursive: true, force: true })

  const stat = fs.statSync(ZIP_PATH)
  console.log(`Wrote ${ZIP_PATH} (${Math.round(stat.size / 1024)} KB)`)
}

main()
