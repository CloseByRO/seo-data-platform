"use client";

import { useState } from "react";

type Props = { orgId: string };

export function OnboardClientForm({ orgId }: Props) {
  const [clientSlug, setClientSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [addressText, setAddressText] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [gbpLocationId, setGbpLocationId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

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
        keywords: keywords
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean),
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

      <div className="space-y-1">
        <label className="text-sm font-medium">Address</label>
        <input
          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          placeholder="Strada Exemplu 1, București"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Lat</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="44.123"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Lng</label>
          <input
            className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="26.123"
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

      <div className="space-y-1">
        <label className="text-sm font-medium">Keywords (one per line)</label>
        <textarea
          className="h-40 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-black"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={"psiholog sector 3\npsihoterapie pallady\nterapie anxietate bucuresti\n..."}
        />
      </div>

      {status ? <p className="text-sm text-red-600 dark:text-red-400">{status}</p> : null}

      <button className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition-all duration-150 ease-out hover:shadow-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/30">
        Create client + location
      </button>
    </form>
  );
}

