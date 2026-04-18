# Parity with `closeby-demo-project`

This folder is copied verbatim into generated sites as `closeby/` (see `build-template-zip.mjs`). The **canonical** Next.js demo lives in the separate **`closeby-demo-project`** repo.

Whenever you change **shared UI or integration plumbing** in the demo, update **both** places below so future `website-app-template.zip` builds stay consistent.

## 1. Files maintained **here** (`scripting/website/closeby/`)

Keep in sync with the demo path on the **same relative role** (copy or port the same behavior):

| Demo (`closeby-demo-project`) | Embedded here |
|------------------------------|----------------|
| `components/providers/client-config-provider.tsx` | `closeby/providers/client-config-provider.tsx` |

Section/header variants (`hero/`, `about/`, `registry.ts`, …) also live only here — mirror any **presentation** changes you make to matching demo components if those sections are duplicated for the pipeline.

## 2. Files maintained in **`WEBSITE_TEMPLATE_SOURCE`** (template app root)

The zip is built from `WEBSITE_TEMPLATE_SOURCE` (see `npm run template:zip`). That tree should track the demo for **app shell** and **integrations**, for example:

- `app/layout.tsx` — `getMergedClientConfig`, `ClientConfigProvider` (can import from `@/components/...` **or** `@closeby/providers/client-config-provider`)
- `components/sections/booking-section.tsx` — `useMergedClientConfig` + Cal embed
- `lib/integrations/*`, `lib/services/calApi.ts`, `app/api/webhooks/cal/route.ts`
- `config/client.ts`, `config/load-base-client.ts`, `config/apply-env-integrations.ts`
- `types/calcom.ts` (organizer `username`, etc.)

After editing the template app, refresh the bundle:

```bash
WEBSITE_TEMPLATE_SOURCE=/absolute/path/to/template-app npm run template:zip
```

## 3. Database / Supabase

Migrations and SQL live in **`seo-data-platform/supabase/`** (not in this folder). See `supabase/README.md`.
