"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = { orgId: string };

function normalizeKeyword(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function OnboardClientForm({ orgId }: Props) {
  const [clientSlug, setClientSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [addressText, setAddressText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [gbpLocationId, setGbpLocationId] = useState("");

  const [keywordInput, setKeywordInput] = useState("");
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const keywordTagsRef = useRef<string[]>([]);
  keywordTagsRef.current = keywordTags;

  const addKeyword = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const norm = normalizeKeyword(t);
    setKeywordTags((prev) => {
      if (prev.some((k) => normalizeKeyword(k) === norm)) return prev;
      return [...prev, t];
    });
  }, []);

  const removeKeyword = useCallback((index: number) => {
    setKeywordTags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveSuggestionToKeywords = useCallback((s: string) => {
    addKeyword(s);
    setSuggestions((prev) => prev.filter((x) => x !== s));
  }, [addKeyword]);

  useEffect(() => {
    setSuggestions((prev) =>
      prev.filter((s) => !keywordTags.some((k) => normalizeKeyword(k) === normalizeKeyword(s))),
    );
  }, [keywordTags]);

  function onKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addKeyword(keywordInput);
    setKeywordInput("");
  }

  async function lookupAddress() {
    setGeoError(null);
    const addr = addressText.trim();
    if (!addr) {
      setGeoError("Enter an address first.");
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch("/api/onboarding/geocode-suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, displayName: displayName.trim() }),
      });
      const json = (await res.json()) as {
        lat?: number;
        lng?: number;
        suggestions?: string[];
        error?: string;
      };
      if (!res.ok) {
        setGeoError(json.error ?? "Could not geocode address");
        return;
      }
      if (json.lat != null && json.lng != null) {
        setLat(String(json.lat));
        setLng(String(json.lng));
      }
      const sug = json.suggestions ?? [];
      const tags = keywordTagsRef.current;
      setSuggestions(
        sug.filter((s) => !tags.some((k) => normalizeKeyword(k) === normalizeKeyword(s))),
      );
    } catch (e) {
      setGeoError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeoLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!lat.trim() || !lng.trim()) {
      setStatus("Set coordinates using “Set pin from address” or enter latitude and longitude.");
      return;
    }
    if (keywordTags.length === 0) {
      setStatus("Add at least one keyword (type and press Enter).");
      return;
    }

    const res = await fetch("/api/onboarding/create-client", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId,
        clientSlug,
        displayName,
        primaryDomain,
        location: {
          addressText,
          lat: lat ? Number(lat) : null,
          lng: lng ? Number(lng) : null,
          placeId: placeId || null,
          gbpLocationId: gbpLocationId || null,
        },
        keywords: keywordTags,
      }),
    });

    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      clientId?: string;
      locationId?: string;
    };

    if (!res.ok || !json.ok || !json.clientId || !json.locationId) {
      setStatus(json.error ?? "Onboarding failed");
      return;
    }

    window.location.href = `/dashboard/${encodeURIComponent(json.clientId)}/${encodeURIComponent(
      json.locationId
    )}?org_id=${encodeURIComponent(orgId)}`;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Client slug</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={clientSlug}
            onChange={(e) => setClientSlug(e.target.value)}
            placeholder="acme-therapy"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Display name</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Acme Therapy"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Primary domain (optional)</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">GBP location id (optional)</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={gbpLocationId}
            onChange={(e) => setGbpLocationId(e.target.value)}
            placeholder="locations/1234567890"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-sm font-medium">Address</label>
            <input
              className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder="Strada Exemplu 1, București"
              required
            />
          </div>
          <button
            type="button"
            onClick={() => void lookupAddress()}
            disabled={geoLoading}
            className="h-10 shrink-0 rounded-md border border-black/10 bg-white px-3 text-sm font-medium transition-all duration-150 hover:bg-black/[.04] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-black dark:hover:bg-white/10"
          >
            {geoLoading ? "Looking up…" : "Set pin from address"}
          </button>
        </div>
        {geoError ? <p className="text-sm text-amber-700 dark:text-amber-300">{geoError}</p> : null}
        <p className="text-xs text-black/50 dark:text-white/50">
          Uses OpenStreetMap Nominatim to fill latitude/longitude. Add display name before lookup for better keyword ideas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Latitude</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="from address lookup"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Longitude</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="from address lookup"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Place ID (optional)</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            placeholder="ChIJ..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Keywords</label>
        <input
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={onKeywordKeyDown}
          placeholder="Type a keyword and press Enter"
        />
        {keywordTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {keywordTags.map((k, i) => (
              <button
                key={`${k}-${i}`}
                type="button"
                onClick={() => removeKeyword(i)}
                className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-black/[.04] px-3 py-1 text-xs font-medium transition-colors hover:bg-black/10 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/15"
                title="Click to remove"
              >
                <span>{k}</span>
                <span className="text-black/40 dark:text-white/40">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-black/50 dark:text-white/50">No keywords yet — add at least one (Enter).</p>
        )}

        {suggestions.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-black/60 dark:text-white/60">Suggestions (click to add)</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => moveSuggestionToKeywords(s)}
                  className="inline-flex items-center rounded-full border border-dashed border-black/20 bg-white px-3 py-1 text-xs text-black/80 transition-all hover:border-black/40 hover:bg-black/[.03] dark:border-white/25 dark:bg-black dark:text-white/90 dark:hover:bg-white/10"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {status ? <p className="text-sm text-red-600 dark:text-red-400">{status}</p> : null}

      <button
        type="submit"
        className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30"
      >
        Create client + location
      </button>
    </form>
  );
}
