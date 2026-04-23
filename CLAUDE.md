@AGENTS.md
@README.md

## Working notes (internal)

- **Current state**: onboarding intake is debug-only (JSON output + validation). No persistence/pipeline yet.
- **Today updates**:
  - Hyper-local **Location Intelligence**: city/sector/neighborhood derived from `lib/romania/locations.ts` (anchors + metro), with substring-safe matching.
  - Keyword intelligence uses **Maps SERP** for local-pack classification (`lib/providers/dataforseo/serp-maps.ts`).
  - Added `geoFocus` (sector + neighborhood) to keep București runs focused (avoid “all sectors” scatter).
  - Basic-plan handling: when DataForSEO returns **Payment Required** for Clickstream / Google Ads / Labs, pipeline continues with Maps SERP classification.
- **Next milestone**: update DataForSEO plan/key to enable full metrics (Clickstream/Google Ads) + Labs competitor expansion, then re-run tuning.
- **Key files**:
  - `components/onboarding/psychologist-intake-form.tsx`
  - `lib/validation/onboarding-intake.ts`
  - `app/api/onboarding/intake/validate/route.ts`
  - `supabase/migrations/0009_onboarding_intakes_pipeline.sql`
  - `lib/romania/locations.ts`
  - `lib/seo/keyword-intelligence.ts`
  - `lib/providers/dataforseo/serp-maps.ts`
