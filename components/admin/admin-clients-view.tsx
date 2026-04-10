"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ExternalLink, LineChart } from "lucide-react";
import { ClientDetailPanel } from "@/components/clients/client-detail-panel";

function websiteHref(primaryDomain: string | null): string | null {
  if (!primaryDomain?.trim()) return null;
  const d = primaryDomain.trim();
  if (d.startsWith("http://") || d.startsWith("https://")) return d;
  return `https://${d}`;
}

function gbpMapsHref(gbpLocationId: string | null): string | null {
  if (!gbpLocationId?.trim()) return null;
  return `https://business.google.com/locations/l/${encodeURIComponent(gbpLocationId)}`;
}

type ClientListRow = {
  id: string;
  display_name: string;
  client_slug: string;
  primary_domain: string | null;
  created_at: string;
  updated_at: string;
  /** Primary location GBP id if any */
  gbp_location_id: string | null;
  /** Last successful ingest_serp_grid finished_at (ISO) */
  last_serp_sync_at: string | null;
};

/** Slide-over panel client row (no list-only enrichment fields). */
type PanelClientRow = {
  id: string;
  display_name: string;
  client_slug: string;
  primary_domain: string | null;
  created_at: string;
  updated_at: string;
};

type LocationRow = {
  id: string;
  address_text: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  gbp_location_id: string | null;
};

type KeywordRow = { id: string; keyword_raw: string };

type Props = {
  orgId: string;
  clients: ClientListRow[];
  page: number;
  totalPages: number;
  sort: string;
  selectedId: string | null;
  detail: {
    client: PanelClientRow;
    locations: LocationRow[];
    keywords: KeywordRow[];
    canEdit: boolean;
    canDelete: boolean;
  } | null;
  mapsEmbedUrl: string | null;
  analyticsHref: string | null;
  keywordsHref: string | null;
};

function buildListHref(page: number, sort: string, selected?: string | null) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("sort", sort);
  if (selected) p.set("selected", selected);
  return `/app/clients?${p.toString()}`;
}

export function AdminClientsView(props: Props) {
  const router = useRouter();
  const open = Boolean(props.selectedId && props.detail);

  function closeSheet() {
    if (typeof window === "undefined") return;
    const next = new URLSearchParams(window.location.search);
    next.delete("selected");
    router.push(`/app/clients?${next.toString()}`);
  }

  const primary = props.detail?.locations[0] ?? null;

  return (
    <div className="px-6 py-10 md:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Clients</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Up to 15 clients per page, newest activity first. Select a row to edit in the panel.
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">GBP</th>
              <th className="px-4 py-3 font-medium">Last SERP sync</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {props.clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No clients for this organization yet. Use onboarding to create one.
                </td>
              </tr>
            ) : (
              props.clients.map((c) => {
                const web = websiteHref(c.primary_domain);
                const gbp = gbpMapsHref(c.gbp_location_id);
                return (
                <tr key={c.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <Link
                      href={buildListHref(props.page, props.sort, c.id)}
                      className="font-medium text-slate-100 hover:underline"
                    >
                      {c.display_name}
                    </Link>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-slate-400">
                    {web ? (
                      <a
                        href={web}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400/90 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.primary_domain?.replace(/^https?:\/\//, "") ?? "—"}
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {gbp ? (
                      <a
                        href={gbp}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-emerald-400/90 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {c.last_serp_sync_at
                      ? new Date(c.last_serp_sync_at).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
        <Link
          aria-disabled={props.page <= 1}
          className={`rounded-lg border border-slate-700 px-3 py-2 ${
            props.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-900"
          }`}
          href={buildListHref(Math.max(1, props.page - 1), props.sort, props.selectedId)}
        >
          Previous
        </Link>
        <span>
          Page {props.page} / {props.totalPages}
        </span>
        <Link
          aria-disabled={props.page >= props.totalPages}
          className={`rounded-lg border border-slate-700 px-3 py-2 ${
            props.page >= props.totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-900"
          }`}
          href={buildListHref(Math.min(props.totalPages, props.page + 1), props.sort, props.selectedId)}
        >
          Next
        </Link>
      </div>

      {open && props.detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 p-0 md:p-4" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close panel" onClick={closeSheet} />
          <div className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950 shadow-xl md:max-w-2xl md:rounded-xl md:border">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-lg font-semibold text-white">{props.detail.client.display_name}</h2>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {primary && (primary.lat != null && primary.lng != null) ? (
                <div className="mb-6 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</p>
                  {props.mapsEmbedUrl ? (
                    <iframe
                      title="Map preview"
                      className="h-48 w-full rounded-lg border border-slate-800"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={props.mapsEmbedUrl}
                    />
                  ) : null}
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(`${primary.lat},${primary.lng}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"
                  >
                    Open in Google Maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <p className="mb-6 text-sm text-amber-400/90">
                  Set latitude and longitude on the primary location to enable map preview and SERP grid ingest.
                </p>
              )}

              <div className="mb-6 flex flex-wrap gap-2">
                {props.analyticsHref ? (
                  <a
                    href={props.analyticsHref}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    <LineChart className="h-4 w-4" />
                    View analytics
                  </a>
                ) : null}
                {props.keywordsHref ? (
                  <Link
                    href={props.keywordsHref}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
                  >
                    Manage keywords
                  </Link>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                <ClientDetailPanel
                  orgId={props.orgId}
                  client={props.detail.client}
                  locations={props.detail.locations}
                  keywords={props.detail.keywords}
                  canEdit={props.detail.canEdit}
                  canDelete={props.detail.canDelete}
                  afterDeleteHref="/app/clients"
                  variant="dark"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
