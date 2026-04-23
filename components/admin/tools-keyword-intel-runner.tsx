"use client"

import { useMemo, useState } from "react"

type KeywordIntelDryRunResponse =
  | { ok: true; dryRun: true; output: { gridKeywords: string[]; landingKeywords: string[]; contentKeywords: string[]; debug?: unknown } }
  | { error: unknown }

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function safeJsonParse(s: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function coerceNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function uniqueStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of arr) {
    if (typeof v !== "string") continue
    const t = v.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function buildBodyFromIntake(args: { orgId: string; intake: unknown }) {
  const x = args.intake as Record<string, unknown>
  const location = (x.location ?? {}) as Record<string, unknown>

  const locality = asString(location.locality) ?? asString(location.localityRaw) ?? asString(x.locality)
  const county = asString(location.county) ?? asString(x.county)

  const lat = coerceNumber(location.lat)
  const lng = coerceNumber(location.lng)
  const sector = asString(location.sector)
  const neighborhood = asString(location.neighborhood)

  const keywords = (x.keywords ?? {}) as Record<string, unknown>
  const seedKeywords = uniqueStrings(keywords.seedKeywords ?? x.seedKeywords)
  const specialties = uniqueStrings(x.specialties)
  const services = Array.isArray(x.services)
    ? (x.services as unknown[]).map((s) => (typeof (s as { name?: unknown })?.name === "string" ? String((s as { name: string }).name).trim() : "")).filter(Boolean)
    : uniqueStrings(x.services)

  return {
    orgId: args.orgId,
    locality: locality ?? "",
    county: county ?? "",
    seedKeywords,
    services,
    specialties,
    targetCount: 35,
    dryRun: true,
    center: lat != null && lng != null ? { lat, lng, radiusM: 2000 } : undefined,
    geoFocus: sector || neighborhood ? { sector: sector ?? undefined, neighborhood: neighborhood ?? undefined } : undefined,
  }
}

const DEFAULT_INTAKE_EXAMPLE = `{
  "orgId": "00000000-0000-0000-0000-000000000000",
  "location": {
    "locality": "București",
    "county": "București",
    "lat": 44.3932226,
    "lng": 26.1227391,
    "sector": "Sector 4",
    "neighborhood": "Olteniței"
  },
  "services": [
    { "name": "Terapie individuală" },
    { "name": "Terapie de cuplu" }
  ],
  "specialties": ["Anxietate", "Depresie"],
  "keywords": {
    "seedKeywords": [
      "psiholog București",
      "psiholog Sector 4",
      "Psiholog Olteniței",
      "Anxietate Sector 4",
      "Anxietate Olteniței"
    ]
  }
}`

export function ToolsKeywordIntelRunner(props: { operatorOrgId: string }) {
  const [intakeRaw, setIntakeRaw] = useState(DEFAULT_INTAKE_EXAMPLE)
  const [result, setResult] = useState<KeywordIntelDryRunResponse | null>(null)
  const [running, setRunning] = useState(false)

  const parsed = useMemo(() => safeJsonParse(intakeRaw), [intakeRaw])

  const derived = useMemo(() => {
    if (!parsed.ok) return null
    return buildBodyFromIntake({ orgId: props.operatorOrgId, intake: parsed.value })
  }, [parsed, props.operatorOrgId])

  const canRun =
    !!derived &&
    derived.locality.trim().length > 0 &&
    derived.county.trim().length > 0 &&
    derived.seedKeywords.length > 0 &&
    derived.services.length > 0

  async function run() {
    if (!derived) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch("/api/dataforseo/keywords/intel/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(derived),
      })
      const json = (await res.json()) as KeywordIntelDryRunResponse
      if (!res.ok) {
        setResult({ error: (json as { error?: unknown })?.error ?? json })
      } else {
        setResult(json)
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500">
        Paste a real intake payload (Step 4 JSON) or use the example. We run a <span className="text-slate-200">dryRun</span> (no DB writes).
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">
            Derived request:{" "}
            {derived ? (
              <span className="font-mono text-slate-200">
                {derived.locality} · {derived.county}
                {derived.geoFocus?.sector ? ` · ${derived.geoFocus.sector}` : ""}
                {derived.geoFocus?.neighborhood ? ` · ${derived.geoFocus.neighborhood}` : ""}
              </span>
            ) : (
              <span className="text-rose-300">{parsed.ok ? "Invalid shape" : parsed.error}</span>
            )}
          </div>
          <button
            type="button"
            className={clsx(
              "rounded-lg px-3 py-2 text-xs font-medium",
              canRun && !running ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-800 text-slate-400 cursor-not-allowed",
            )}
            onClick={() => void run()}
            disabled={!canRun || running}
            title={!canRun ? "Need locality/county + services + seedKeywords" : ""}
          >
            {running ? "Running…" : "Run keyword-intel (dryRun)"}
          </button>
        </div>

        <textarea
          className="min-h-[220px] w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200"
          value={intakeRaw}
          onChange={(e) => setIntakeRaw(e.target.value)}
          spellCheck={false}
        />
      </div>

      {result ? (
        "ok" in result && (result as any).ok ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs font-medium text-slate-200">
                Grid ({result.output.gridKeywords.length})
              </div>
              <pre className="mt-2 max-h-56 overflow-auto text-xs text-emerald-200/90">
                {result.output.gridKeywords.join("\n")}
              </pre>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs font-medium text-slate-200">
                Landing ({result.output.landingKeywords.length})
              </div>
              <pre className="mt-2 max-h-56 overflow-auto text-xs text-emerald-200/90">
                {result.output.landingKeywords.join("\n")}
              </pre>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs font-medium text-slate-200">
                Content ({result.output.contentKeywords.length})
              </div>
              <pre className="mt-2 max-h-56 overflow-auto text-xs text-emerald-200/90">
                {result.output.contentKeywords.join("\n")}
              </pre>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-200">
            <div className="font-medium">Run failed</div>
            <pre className="mt-2 max-h-56 overflow-auto text-xs text-rose-200/80">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )
      ) : null}
    </div>
  )
}

