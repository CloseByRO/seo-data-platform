<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Repo-specific notes

- This app is on **Next.js 16** and uses the **`proxy.ts`** convention (do not reintroduce `middleware.ts`).
- Prefer the embedded Next docs at `node_modules/next/dist/docs/` when dealing with framework-level behavior.

### Internal onboarding (psychologist cabinets)

- **Entry point**: `/clients/new?org_id=<uuid>` renders the internal multi-step intake form (debug-only for now).
- **Payload schema**: `lib/validation/onboarding-intake.ts` (Zod). Treat it as the contract for the onboarding pipeline.
- **Server-side validation**: `POST /api/onboarding/intake/validate` (RBAC + masked secrets).
- **Operator UX**: the form includes an **“Operator advanced”** toggle; keep default mode minimal and derive values when possible.
- **Admin tools**: `/app/tools` is the internal operator page for running ingestion/jobs + onboarding utilities.

#### Hyper-local location intelligence

- **Source of truth**: `lib/romania/locations.ts` (`CITY_NEIGHBORHOODS_MAPPING`).
- The onboarding form derives **city / sector (București) / neighborhood** from Google Places + local anchors.
- Important: neighborhood matching must avoid substring collisions (e.g. `"Olteniței"` should not match `"Tei"`).

#### Keyword intelligence

- **Pipeline**: `lib/seo/keyword-intelligence.ts`
- **Maps SERP classifier**: `lib/providers/dataforseo/serp-maps.ts` (detects local-pack presence via DataForSEO Maps SERP).
- **Geo focus**: when intake has a known `sector`/`neighborhood`, pass `geoFocus` so keyword expansion doesn’t scatter across all București sectors/neighborhoods.
<!-- END:nextjs-agent-rules -->
