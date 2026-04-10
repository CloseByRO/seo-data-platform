"use client";

import { useState } from "react";

export function RunIngestButton(props: { orgId: string; clientId: string; locationId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setStatus(null);
    try {
      const res = await fetch("/api/jobs/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: props.orgId,
          clientId: props.clientId,
          locationId: props.locationId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        results?: Record<string, { ok: boolean; skipped?: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatus(json.error ?? "Ingest failed");
        return;
      }
      const skipped = Object.values(json.results ?? {}).some((r) => r.skipped);
      setStatus(skipped ? "Ingest complete (some steps skipped). Refreshing…" : "Ingest complete. Refreshing…");
      window.location.reload();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30"
      >
        {running ? "Running…" : "Run ingest (last 3 days)"}
      </button>
      {status ? <span className="text-xs text-black/60 dark:text-white/60">{status}</span> : null}
    </div>
  );
}

