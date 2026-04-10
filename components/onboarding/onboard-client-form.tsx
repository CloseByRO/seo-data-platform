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

  const [addrQuery, setAddrQuery] = useState("");
  const [addrPredictions, setAddrPredictions] = useState<Array<{ description: string; placeId: string }>>([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);

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

  function buildSuggestionsFromPlace(locality: string | null, region: string | null) {
    const name = displayName.trim() || "business";
    const city = (locality ?? "").trim();
    const reg = (region ?? "").trim();
    const raw = [
      city ? `${name} ${city}` : `${name} near me`,
      city ? `${city} ${name}` : `${name} reviews`,
      city && reg ? `${name} ${city} ${reg}` : "",
      city ? `${name} programări ${city}` : "",
      city ? `${name} ${city} centru` : "",
      `${name} contact`,
      `${name} pret`,
    ].filter(Boolean);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of raw) {
      const k = normalizeKeyword(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
      if (out.length >= 8) break;
    }
    while (out.length < 5) out.push(`${name} ${out.length + 1}`);
    setSuggestions((prev) => {
      const merged = [...out, ...prev];
      const unique: string[] = [];
      const u = new Set<string>();
      for (const s of merged) {
        const k = normalizeKeyword(s);
        if (u.has(k)) continue;
        if (keywordTagsRef.current.some((t) => normalizeKeyword(t) === k)) continue;
        u.add(k);
        unique.push(s);
        if (unique.length >= 10) break;
      }
      return unique;
    });
  }

  useEffect(() => {
    setSuggestions((prev) =>
      prev.filter((s) => !keywordTags.some((k) => normalizeKeyword(k) === normalizeKeyword(s))),
    );
  }, [keywordTags]);

  useEffect(() => {
    // Keep the address search box in sync with the actual address field.
    setAddrQuery(addressText);
  }, [addressText]);

  useEffect(() => {
    const q = addrQuery.trim();
    if (q.length < 3) {
      setAddrPredictions([]);
      setAddrError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setAddrLoading(true);
      setAddrError(null);
      try {
        const res = await fetch("/api/google/places/autocomplete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgId, input: q, language: "ro", region: "ro" }),
        });
        const json = (await res.json()) as {
          predictions?: Array<{ description: string; placeId: string }>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setAddrError(json.error ?? "Autocomplete failed");
          setAddrPredictions([]);
          return;
        }
        setAddrPredictions(json.predictions ?? []);
        setAddrOpen(true);
      } catch (e) {
        if (cancelled) return;
        setAddrError(e instanceof Error ? e.message : String(e));
        setAddrPredictions([]);
      } finally {
        if (!cancelled) setAddrLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addrQuery, orgId]);

  async function selectPrediction(placeId: string, description: string) {
    setAddrOpen(false);
    setAddrError(null);
    setAddressText(description);
    setAddrQuery(description);
    setPlaceId(placeId);
    try {
      const res = await fetch("/api/google/places/details", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, placeId, language: "ro" }),
      });
      const json = (await res.json()) as {
        formattedAddress?: string | null;
        lat?: number;
        lng?: number;
        locality?: string | null;
        region?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setAddrError(json.error ?? "Failed to load address details");
        return;
      }
      if (json.formattedAddress) {
        setAddressText(json.formattedAddress);
        setAddrQuery(json.formattedAddress);
      }
      if (json.lat != null && json.lng != null) {
        setLat(String(json.lat));
        setLng(String(json.lng));
      }
      buildSuggestionsFromPlace(json.locality ?? null, json.region ?? null);
    } catch (e) {
      setAddrError(e instanceof Error ? e.message : String(e));
    }
  }

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
        body: JSON.stringify({ orgId, address: addr, displayName: displayName.trim() }),
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
              onChange={(e) => {
                setAddressText(e.target.value);
                setAddrOpen(true);
              }}
              onFocus={() => setAddrOpen(true)}
              onBlur={() => {
                // Let click events on dropdown buttons run first
                setTimeout(() => setAddrOpen(false), 120);
              }}
              placeholder="Strada Exemplu 1, București"
              required
            />
            {addrOpen && (addrPredictions.length > 0 || addrLoading || addrError) ? (
              <div className="relative">
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/15 dark:bg-black">
                  {addrLoading ? (
                    <div className="px-3 py-2 text-sm text-black/60 dark:text-white/60">Searching…</div>
                  ) : addrError ? (
                    <div className="px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{addrError}</div>
                  ) : addrPredictions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-black/60 dark:text-white/60">No suggestions</div>
                  ) : (
                    <div className="max-h-64 overflow-auto">
                      {addrPredictions.slice(0, 8).map((p) => (
                        <button
                          key={p.placeId}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void selectPrediction(p.placeId, p.description)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-black/[.04] dark:hover:bg-white/10"
                        >
                          {p.description}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
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
