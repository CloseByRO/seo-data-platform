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
};

function cleanCoord(v: number | null): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function ClientDetailPanel(props: Props) {
  const router = useRouter();
  const { orgId, client, canEdit } = props;

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
      window.location.href = `/clients?org_id=${encodeURIComponent(orgId)}`;
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
      <p className="rounded-xl border border-black/10 p-4 text-sm text-black/70 dark:border-white/15 dark:text-white/70">
        You can view this client. Editing and deletion are limited to CloseBy platform admins (owner/admin in the
        operator org).
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-semibold">Edit client</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Display name</label>
            <input
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Client slug</label>
            <input
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium">Primary domain (optional)</label>
            <input
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
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
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {clientSaving ? "Saving…" : "Save client"}
          </button>
          <button
            type="button"
            disabled={clientSaving}
            onClick={() => void deleteClient()}
            className="rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
          >
            Delete client
          </button>
          {clientStatus ? <span className="text-sm text-black/60 dark:text-white/60">{clientStatus}</span> : null}
        </div>
        <p className="mt-3 text-xs text-black/50 dark:text-white/50">Created {new Date(client.created_at).toLocaleString()}</p>
      </section>

      <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-semibold">Locations</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Edit address and identifiers per location. Save each row separately.</p>
        <div className="mt-4 space-y-6">
          {locations.map((loc) => (
            <LocationEditorBlock
              key={locationStableKey(loc)}
              loc={loc}
              disabled={clientSaving}
              onSave={(draft) => void saveLocation(loc, draft)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-lg font-semibold">Keywords</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Type a keyword and press Enter. Click a tag to remove. Save when done.</p>
        <input
          className="mt-3 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
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
              className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-black/[.04] px-3 py-1 text-xs font-medium transition-colors hover:bg-black/10 dark:border-white/20 dark:bg-white/10"
              title="Remove"
            >
              <span>{k}</span>
              <span className="text-black/40 dark:text-white/40">×</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={kwSaving}
            onClick={() => void saveKeywords()}
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {kwSaving ? "Saving…" : "Save keywords"}
          </button>
          {kwStatus ? <span className="text-sm text-black/60 dark:text-white/60">{kwStatus}</span> : null}
        </div>
      </section>
    </div>
  );
}

function LocationEditorBlock(props: {
  loc: LocationRow;
  disabled: boolean;
  onSave: (draft: LocationRow) => void;
}) {
  const [draft, setDraft] = useState<LocationRow>(() => props.loc);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Address</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={draft.address_text}
            onChange={(e) => setDraft((d) => ({ ...d, address_text: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Latitude</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={draft.lat === null ? "" : String(draft.lat)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setDraft((d) => ({ ...d, lat: v === "" ? null : Number(v) }));
            }}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Longitude</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={draft.lng === null ? "" : String(draft.lng)}
            onChange={(e) => {
              const v = e.target.value.trim();
              setDraft((d) => ({ ...d, lng: v === "" ? null : Number(v) }));
            }}
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Place ID (optional)</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={draft.place_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, place_id: e.target.value || null }))}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">GBP location id (optional)</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
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
        className="mt-2 rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10"
      >
        Save this location
      </button>
    </div>
  );
}
