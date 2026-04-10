import { z } from 'zod'

export const uuidString = z.string().uuid('Invalid id')

export const orgIdBody = z.object({
  orgId: z.string().uuid('Invalid orgId'),
})

export const patchClientBody = z
  .object({
    orgId: z.string().uuid(),
    displayName: z.string().min(1).max(500).optional(),
    clientSlug: z.string().min(1).max(200).optional(),
    primaryDomain: z.union([z.string().max(500), z.null()]).optional(),
  })
  .superRefine((val, ctx) => {
    const keys = Object.keys(val).filter((k) => k !== 'orgId')
    if (keys.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'No fields to update' })
    }
  })

export const putKeywordsBody = orgIdBody.extend({
  keywords: z.array(z.string().max(500)).min(1, 'Provide at least 1 keyword').max(200),
})

export const onboardingCreateClientBody = z.object({
  orgId: z.string().uuid(),
  clientSlug: z.string().min(1).max(200),
  displayName: z.string().min(1).max(500),
  primaryDomain: z.string().max(500).optional(),
  location: z.object({
    addressText: z.string().min(1).max(2000),
    lat: z.number().finite().nullable(),
    lng: z.number().finite().nullable(),
    placeId: z.string().max(200).nullable(),
    gbpLocationId: z.string().max(500).nullable(),
  }),
  keywords: z.array(z.string().min(1).max(500)).min(1).max(200),
})

export const ingestJobBody = z.object({
  orgId: z.string().uuid(),
  clientId: z.string().uuid(),
  locationId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const orgCreateBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
})

export const placesAutocompleteBody = z.object({
  orgId: z.string().uuid(),
  input: z.string().optional(),
  language: z.string().max(10).optional(),
  region: z.string().max(10).optional(),
})

export const placesDetailsBody = z.object({
  orgId: z.string().uuid(),
  placeId: z.string().min(1).max(300),
  language: z.string().max(10).optional(),
})

export const geocodeSuggestionsBody = z.object({
  orgId: z.string().uuid(),
  address: z.string().min(1).max(2000),
  displayName: z.string().max(500).optional(),
})

export const patchLocationBody = z
  .object({
    orgId: z.string().uuid(),
    addressText: z.string().min(1).max(2000).optional(),
    lat: z.number().finite().nullable().optional(),
    lng: z.number().finite().nullable().optional(),
    placeId: z.string().max(200).nullable().optional(),
    gbpLocationId: z.string().max(500).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const keys = Object.keys(val).filter((k) => k !== 'orgId')
    if (keys.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'No fields to update' })
    }
  })
