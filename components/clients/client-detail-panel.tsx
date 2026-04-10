"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function normalizeKeyword(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

type ClientRow = {
  id: string;
  display_name: string;
  client_slug: string;
  primary_domain: string | null;
  created_at: string;
};

type LocationRow = {
  id: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  gbp_location_id: string | null;
};

function locationStableKey(loc: LocationRow) {
  return [
    loc.id,
    loc.address_text,
    loc.lat ?? "",
    loc.lng ?? "",
    loc.place_id ?? "",
    loc.gbp_location_id ?? "",
  ].join("\u0000");
}

type KeywordRow = {
  id: string;
  keyword_raw: string;
};

type Props = {
  orgId: string;
  client: ClientRow;
  locations: LocationRow[];
  keywords: KeywordRow[];
  canEdit: boolean;
  canDelete: boolean;
  /** When set, redirect here after successful delete instead of legacy /clients. */
  afterDeleteHref?: string;
  /** Use slate text that reads on dark admin chrome (avoids relying on `dark:` on &lt;html&gt;). */
  variant?: "default" | "dark";
};

function cleanCoord(v: number | null): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function ClientDetailPanel(props: Props) {
  const router = useRouter();
  const { orgId, client, canEdit, canDelete, afterDeleteHref } = props;
  const dark = props.variant === "dark";
  const t = {
    muted: dark ? "text-slate-400" : "text-black/60 dark:text-white/60",
    mutedHi: dark ? "text-slate-300" : "text-black/70 dark:text-white/70",
    faint: dark ? "text-slate-500" : "text-black/50 dark:text-white/50",
    heading: dark ? "text-white" : "text-neutral-900 dark:text-white",
    border: dark ? "border-slate-700" : "border-black/10 dark:border-white/15",
    section: dark ? "border-slate-700 bg-slate-950/40" : "border-black/10 dark:border-white/15",
    input: dark
      ? "border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500"
      : "border-black/10 bg-white dark:border-white/15 dark:bg-black",
    btnGhost: dark ? "border-slate-600 text-slate-200 hover:bg-slate-800" : "border-black/10 hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/10",
    locTitle: dark ? "font-medium text-slate-200" : "font-medium text-black/80 dark:text-white/80",
    chip: dark
      ? "border-slate-600 bg-slate-800/80 text-slate-200"
      : "border-black/15 bg-black/[.04] dark:border-white/20 dark:bg-white/10",
  };
  const lbl = dark ? "text-sm font-medium text-slate-300" : "text-sm font-medium";

  const [displayName, setDisplayName] = useState(client.display_name);
  const [clientSlug, setClientSlug] = useState(client.client_slug);
  const [primaryDomain, setPrimaryDomain] = useState(client.primary_domain ?? "");
  const [clientStatus, setClientStatus] = useState<string | null>(null);
  const [clientSaving, setClientSaving] = useState(false);

  const [locations, setLocations] = useState<LocationRow[]>(props.locations);
  useEffect(() => {
    setLocations(props.locations);
  }, [props.locations]);

  const [keywordInput, setKeywordInput] = useState("");
  const [keywordTags, setKeywordTags] = useState<string[]>(props.keywords.map((k) => k.keyword_raw));
  const [kwStatus, setKwStatus] = useState<string | null>(null);
  const [kwSaving, setKwSaving] = useState(false);

  useEffect(() => {
    setKeywordTags(props.keywords.map((k) => k.keyword_raw));
  }, [props.keywords]);

  const addKeyword = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const norm = normalizeKeyword(t);
    setKeywordTags((prev) => {
      if (prev.some((k) => normalizeKeyword(k) === norm)) return prev;
      return [...prev, t];
    });
  }, []);

  function onKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addKeyword(keywordInput);
    setKeywordInput("");
  }

  async function saveClient() {
    setClientStatus(null);
    setClientSaving(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId,
          displayName: displayName.trim(),
          clientSlug: clientSlug.trim(),
          primaryDomain: primaryDomain.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setClientStatus(json.error ?? "Save failed");
        return;
      }
      setClientStatus("Saved.");
      router.refresh();
    } catch (e) {
      setClientStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setClientSaving(false);
    }
  }

  async function deleteClient() {
    if (!window.confirm(`Delete client “${client.display_name}” and all related data? This cannot be undone.`)) {
      return;
    }
    setClientStatus(null);
    setClientSaving(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}?org_id=${encodeURIComponent(orgId)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setClientStatus(json.error ?? "Delete failed");
        return;
      }
      window.location.href = afterDeleteHref ?? `/clients?org_id=${encodeURIComponent(orgId)}`;
    } catch (e) {
      setClientStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setClientSaving(false);
    }
  }

  async function saveLocation(loc: LocationRow, draft: LocationRow) {
    setClientStatus(null);
    setClientSaving(true);
    try {
      const res = await fetch(`/api/locations/${encodeURIComponent(loc.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId,
          addressText: draft.address_text.trim(),
          lat: cleanCoord(draft.lat),
          lng: cleanCoord(draft.lng),
          placeId: draft.place_id?.trim() || null,
          gbpLocationId: draft.gbp_location_id?.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setClientStatus(json.error ?? "Location save failed");
        return;
      }
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...draft } : l)));
      setClientStatus("Location saved.");
      router.refresh();
    } catch (e) {
      setClientStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setClientSaving(false);
    }
  }

  async function saveKeywords() {
    setKwStatus(null);
    setKwSaving(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}/keywords`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, keywords: keywordTags }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setKwStatus(json.error ?? "Keywords save failed");
        return;
      }
      setKwStatus("Keywords saved.");
      router.refresh();
    } catch (e) {
      setKwStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setKwSaving(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-8">
        <p className={`text-sm ${t.mutedHi}`}>
          You can view this client. Editing (name, address, keywords) is available to org owners, admins, and members.
          Viewers are read-only here.
        </p>
        <section className={`rounded-2xl border p-6 ${t.section}`}>
          <h2 className={`text-lg font-semibold ${t.heading}`}>Client</h2>
          <dl className={`mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 ${dark ? "text-slate-200" : ""}`}>
            <div>
              <dt className={`text-xs ${t.faint}`}>Display name</dt>
              <dd className="font-medium">{client.display_name}</dd>
            </div>
            <div>
              <dt className={`text-xs ${t.faint}`}>Slug</dt>
              <dd>{client.client_slug}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className={`text-xs ${t.faint}`}>Primary domain</dt>
              <dd>{client.primary_domain ?? "—"}</dd>
            </div>
          </dl>
          <p className={`mt-3 text-xs ${t.faint}`}>Created {new Date(client.created_at).toLocaleString()}</p>
        </section>
        <section className={`rounded-2xl border p-6 ${t.section}`}>
          <h2 className={`text-lg font-semibold ${t.heading}`}>Locations</h2>
          <div className="mt-4 space-y-4">
            {props.locations.map((loc) => (
              <div key={loc.id} className={`rounded-xl border p-4 text-sm ${t.border}`}>
                <div className={t.locTitle}>{loc.address_text}</div>
                <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${t.muted}`}>
                  <span>
                    Lat {loc.lat ?? "—"} · Lng {loc.lng ?? "—"}
                  </span>
                  <span>Place ID: {loc.place_id ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className={`rounded-2xl border p-6 ${t.section}`}>
          <h2 className={`text-lg font-semibold ${t.heading}`}>Keywords</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.keywords.map((k) => (
              <span
                key={k.id}
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${t.chip}`}
              >
                {k.keyword_raw}
              </span>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className={`rounded-2xl border p-6 ${t.section}`}>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Edit client</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className={lbl}>Display name</label>
            <input
              className={`w-full rounded-md border px-3 py-2 text-sm ${t.input}`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className={lbl}>Client slug</label>
            <input
              className={`w-full rounded-md border px-3 py-2 text-sm ${t.input}`}
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className={lbl}>Primary domain (optional)</label>
            <input
              className={`w-full rounded-md border px-3 py-2 text-sm ${t.input}`}
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value)}
              placeholder="example.com"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={clientSaving}
            onClick={() => void saveClient()}
            className={
              dark
                ? "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50"
                : "rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 dark:bg-white dark:text-black"
            }
          >
            {clientSaving ? "Saving…" : "Save client"}
          </button>
          {canDelete ? (
            <button
              type="button"
              disabled={clientSaving}
              onClick={() => void deleteClient()}
              className="rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
            >
              Delete client
            </button>
          ) : null}
          {clientStatus ? <span className={`text-sm ${t.muted}`}>{clientStatus}</span> : null}
        </div>
        <p className={`mt-3 text-xs ${t.faint}`}>Created {new Date(client.created_at).toLocaleString()}</p>
      </section>

      <section className={`rounded-2xl border p-6 ${t.section}`}>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Locations</h2>
        <p className={`mt-1 text-sm ${t.muted}`}>Edit address and identifiers per location. Save each row separately.</p>
        <div className="mt-4 space-y-6">
          {locations.map((loc) => (
            <LocationEditorBlock
              key={locationStableKey(loc)}
              loc={loc}
              disabled={clientSaving}
              dark={dark}
              onSave={(draft) => void saveLocation(loc, draft)}
            />
          ))}
        </div>
      </section>

      <section className={`rounded-2xl border p-6 ${t.section}`}>
        <h2 className={`text-lg font-semibold ${t.heading}`}>Keywords</h2>
        <p className={`mt-1 text-sm ${t.muted}`}>
          Type a keyword and press Enter. Click a tag to remove. Save when done.
        </p>
        <input
          className={`mt-3 w-full rounded-md border px-3 py-2 text-sm ${t.input}`}
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={onKeywordKeyDown}
          placeholder="Add keyword and press Enter"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {keywordTags.map((k, i) => (
            <button
              key={`${k}-${i}`}
              type="button"
              onClick={() => setKeywordTags((prev) => prev.filter((_, j) => j !== i))}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                dark
                  ? "border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-800"
                  : "border-black/15 bg-black/[.04] hover:bg-black/10 dark:border-white/20 dark:bg-white/10"
              }`}
              title="Remove"
            >
              <span>{k}</span>
              <span className={dark ? "text-slate-500" : "text-black/40 dark:text-white/40"}>×</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={kwSaving}
            onClick={() => void saveKeywords()}
            className={
              dark
                ? "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                : "rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            }
          >
            {kwSaving ? "Saving…" : "Save keywords"}
          </button>
          {kwStatus ? <span className={`text-sm ${t.muted}`}>{kwStatus}</span> : null}
        </div>
      </section>
    </div>
  );
}

function LocationEditorBlock(props: {
  loc: LocationRow;
  disabled: boolean;
  dark?: boolean;
  onSave: (draft: LocationRow) => void;
}) {
  const [draft, setDraft] = useState<LocationRow>(() => props.loc);
  const dark = Boolean(props.dark);
  const border = dark ? "border-slate-700" : "border-black/10 dark:border-white/15";
  const input = dark
    ? "border-slate-600 bg-slate-900 text-slate-100 placeholder:text-slate-500"
    : "border-black/10 bg-white dark:border-white/15 dark:bg-black";
  const lbl = dark ? "text-sm font-medium text-slate-300" : "text-sm font-medium";

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className={lbl}>Address</label>
          <input
            className={`w-full rounded-md border px-3 py-2 text-sm ${input}`}
            value={draft.address_text}
            onChange={(e) => setDraft((d) => ({ ...d, address_text: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={lbl}>Latitude</label>
          <input
            className={`w-full rounded-md border px-3 py-2 text-sm ${input}`}
            value={draft.lat === null ? "" : String(draft.lat)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setDraft((d) => ({ ...d, lat: v === "" ? null : Number(v) }));
            }}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className={lbl}>Longitude</label>
          <input
            className={`w-full rounded-md border px-3 py-2 text-sm ${input}`}
            value={draft.lng === null ? "" : String(draft.lng)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setDraft((d) => ({ ...d, lng: v === "" ? null : Number(v) }));
            }}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className={lbl}>Place ID (optional)</label>
          <input
            className={`w-full rounded-md border px-3 py-2 text-sm ${input}`}
            value={draft.place_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, place_id: e.target.value || null }))}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className={lbl}>GBP location id (optional)</label>
          <input
            className={`w-full rounded-md border px-3 py-2 text-sm ${input}`}
            value={draft.gbp_location_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, gbp_location_id: e.target.value || null }))}
            placeholder="locations/123..."
          />
        </div>
      </div>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onSave(draft)}
        className={
          dark
            ? "mt-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            : "mt-2 rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
        }
      >
        Save this location
      </button>
    </div>
  );
}
