/**
 * CloseBy component registry (scripting zone — seo-data-platform)
 * ----------------------------------------------------------------
 * - Stable section roots use ids `cb-section-*` (e.g. `cb-section-hero`).
 * - Active layout variant is exposed via `data-cb-variant` (`a`–`f`) for automation and manifests.
 * - Presentation classes (`hero-a`, `about-b`, …) mirror the static mock; anchors stay on stable ids.
 *
 * When the canonical **closeby-demo-project** app changes, keep this tree in sync — see `PARITY.md`.
 */

import type { ComponentType } from 'react'
import type { ClientConfig, ClientLayoutVariants, HexVariant } from '@/types/client-config'
import { HeaderA, HeaderB, HeaderC, HeaderD, HeaderE, HeaderF } from './header/HeaderVariants'
import { HeroA } from './hero/HeroA'
import { HeroB } from './hero/HeroB'
import { HeroC } from './hero/HeroC'
import { HeroD } from './hero/HeroD'
import { HeroE } from './hero/HeroE'
import { HeroF } from './hero/HeroF'
import { ProofA, ProofB, ProofC, ProofD, ProofE, ProofF } from './proof/ProofVariants'
import { AboutA } from './about/AboutA'
import { AboutB } from './about/AboutB'
import { AboutC } from './about/AboutC'
import { AboutD } from './about/AboutD'
import { AboutE } from './about/AboutE'
import { AboutF } from './about/AboutF'
import { ServicesA } from './services/ServicesA'
import { ServicesB } from './services/ServicesB'
import { ServicesC } from './services/ServicesC'
import { ServicesD } from './services/ServicesD'
import { ServicesE } from './services/ServicesE'
import { ServicesF } from './services/ServicesF'
import { ReviewsA } from './reviews/ReviewsA'
import { ReviewsB } from './reviews/ReviewsB'
import { ReviewsC } from './reviews/ReviewsC'
import { ReviewsD } from './reviews/ReviewsD'
import { ReviewsE } from './reviews/ReviewsE'
import { ReviewsF } from './reviews/ReviewsF'
import {
  FAQSectionA,
  FAQSectionB,
  FAQSectionC,
  FAQSectionD,
  FAQSectionE,
  FAQSectionF,
} from './faq/FAQVariants'
import { LocationA, LocationB, LocationC, LocationD, LocationE, LocationF } from './location/LocationVariants'
import { GalleryA, GalleryB, GalleryC, GalleryD, GalleryE, GalleryF } from './gallery/GalleryVariants'

export type SectionProps = { config: ClientConfig }

export const HEADER_BY_VARIANT = {
  a: HeaderA,
  b: HeaderB,
  c: HeaderC,
  d: HeaderD,
  e: HeaderE,
  f: HeaderF,
} as Record<HexVariant, ComponentType<SectionProps>>

export const HERO_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: HeroA,
  b: HeroB,
  c: HeroC,
  d: HeroD,
  e: HeroE,
  f: HeroF,
}

export const PROOF_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: ProofA,
  b: ProofB,
  c: ProofC,
  d: ProofD,
  e: ProofE,
  f: ProofF,
}

export const ABOUT_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: AboutA,
  b: AboutB,
  c: AboutC,
  d: AboutD,
  e: AboutE,
  f: AboutF,
}

export const SERVICES_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: ServicesA,
  b: ServicesB,
  c: ServicesC,
  d: ServicesD,
  e: ServicesE,
  f: ServicesF,
}

export const REVIEWS_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: ReviewsA,
  b: ReviewsB,
  c: ReviewsC,
  d: ReviewsD,
  e: ReviewsE,
  f: ReviewsF,
}

export const FAQ_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: FAQSectionA,
  b: FAQSectionB,
  c: FAQSectionC,
  d: FAQSectionD,
  e: FAQSectionE,
  f: FAQSectionF,
}

export const LOCATION_BY_VARIANT: Record<HexVariant, ComponentType<SectionProps>> = {
  a: LocationA,
  b: LocationB,
  c: LocationC,
  d: LocationD,
  e: LocationE,
  f: LocationF,
}

type GalleryProps = { config: Pick<ClientConfig, 'images' | 'shortName' | 'content'> }

export const GALLERY_BY_VARIANT: Record<HexVariant, ComponentType<GalleryProps>> = {
  a: GalleryA,
  b: GalleryB,
  c: GalleryC,
  d: GalleryD,
  e: GalleryE,
  f: GalleryF,
}

export function defaultLayout(): ClientLayoutVariants {
  return {
    header: 'a',
    hero: 'a',
    proof: 'a',
    about: 'a',
    services: 'a',
    reviews: 'a',
    faq: 'a',
    location: 'a',
    gallery: 'a',
  }
}

export function resolveLayout(config: ClientConfig): ClientLayoutVariants {
  return { ...defaultLayout(), ...config.layout }
}
