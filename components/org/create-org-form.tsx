"use client";

import { useState } from "react";

export function CreateOrgForm() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function onCreate() {
    setStatus(null);
    const trimmed = name.trim();
    if (!trimmed) return;

    const res = await fetch("/api/orgs/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    const json = (await res.json()) as { ok?: boolean; orgId?: string; error?: string };
    if (!res.ok || !json.ok || !json.orgId) {
      setStatus(json.error ?? "Failed to create org");
      return;
    }

    window.location.href = `/org?org_id=${encodeURIComponent(json.orgId)}`;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New org name"
        className="h-10 w-48 rounded-md border border-black/10 bg-white px-3 text-sm dark:border-white/15 dark:bg-black"
      />
      <button
        type="button"
        onClick={onCreate}
        className="h-10 rounded-md bg-black px-3 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30"
      >
        Create
      </button>
      {status ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{status}</span> : null}
    </div>
  );
}

