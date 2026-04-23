import path from 'node:path'
import { z } from 'zod'

export type ScriptId = 'keyword_intel_smoke' | 'onboard_client_dry'

export type ToolsRunKind = 'dry' | 'real'

export type ScriptSpec = {
  id: ScriptId
  label: string
  dryAllowed: boolean
  realAllowed: boolean
  timeoutMs: number
  paramsSchema: z.ZodTypeAny
  buildCommand: (args: { repoRoot: string; params: unknown }) => { cmd: string; args: string[]; cwd: string }
  redactEnvKeys: string[]
}

function repoRootFromCwd() {
  // API routes run with process.cwd() at repo root in Next.js.
  return process.cwd()
}

function tsxCli(repoRoot: string) {
  return path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
}

export const SCRIPT_SPECS: ScriptSpec[] = [
  {
    id: 'keyword_intel_smoke',
    label: 'Keyword intel smoke (fixtures)',
    dryAllowed: true,
    realAllowed: false,
    timeoutMs: 15 * 60_000,
    paramsSchema: z.object({}).default({}),
    buildCommand: ({ repoRoot }) => {
      const cli = tsxCli(repoRoot)
      const script = path.join(repoRoot, 'scripting', 'dataforseo', 'run-keyword-intel-smoke.ts')
      return { cmd: 'node', args: [cli, script], cwd: repoRoot }
    },
    redactEnvKeys: ['DATAFORSEO_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY', 'MONGODB_URI'],
  },
  {
    id: 'onboard_client_dry',
    label: 'Onboard client (dry-run)',
    dryAllowed: true,
    realAllowed: false,
    timeoutMs: 25 * 60_000,
    paramsSchema: z
      .object({
        keepWorkspace: z.boolean().default(true),
      })
      .default({ keepWorkspace: true }),
    buildCommand: ({ repoRoot, params }) => {
      const p = z.object({ keepWorkspace: z.boolean().default(true) }).parse(params)
      const cmd = 'npm'
      const args = ['run', 'onboard:client', '--', '--dry-run', ...(p.keepWorkspace ? ['--keep-workspace'] : [])]
      return { cmd, args, cwd: repoRoot }
    },
    redactEnvKeys: ['ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MONGODB_URI', 'DATAFORSEO_PASSWORD'],
  },
]

export function getScriptSpec(id: string): ScriptSpec | null {
  return SCRIPT_SPECS.find((s) => s.id === id) ?? null
}

export function getRepoRoot() {
  return repoRootFromCwd()
}

