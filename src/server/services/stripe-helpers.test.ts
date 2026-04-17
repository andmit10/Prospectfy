import { describe, it, expect } from 'vitest'
import { mapPriceToPlan, resolveOrgIdFromMetadata } from './stripe-helpers'
import type Stripe from 'stripe'

describe('mapPriceToPlan', () => {
  const env = {
    STRIPE_PRICE_STARTER: 'price_starter_abc',
    STRIPE_PRICE_PRO: 'price_pro_abc',
    STRIPE_PRICE_BUSINESS: 'price_business_abc',
    STRIPE_PRICE_AGENCY: 'price_agency_abc',
    STRIPE_PRICE_ENTERPRISE: 'price_ent_abc',
  } as unknown as NodeJS.ProcessEnv

  it('maps known price ids to their plans', () => {
    expect(mapPriceToPlan('price_starter_abc', env)).toBe('starter')
    expect(mapPriceToPlan('price_pro_abc', env)).toBe('pro')
    expect(mapPriceToPlan('price_business_abc', env)).toBe('business')
    expect(mapPriceToPlan('price_agency_abc', env)).toBe('agency')
    expect(mapPriceToPlan('price_ent_abc', env)).toBe('enterprise')
  })

  it('falls back to starter for unknown or null price', () => {
    expect(mapPriceToPlan(null, env)).toBe('starter')
    expect(mapPriceToPlan('price_unknown', env)).toBe('starter')
  })

  it('does not match when env var is blank', () => {
    const blank = { STRIPE_PRICE_STARTER: '', STRIPE_PRICE_PRO: '' } as unknown as NodeJS.ProcessEnv
    expect(mapPriceToPlan('', blank)).toBe('starter')
    expect(mapPriceToPlan('anything', blank)).toBe('starter')
  })
})

describe('resolveOrgIdFromMetadata', () => {
  it('returns organization_id when present', () => {
    const md = { organization_id: 'org-123' } as unknown as Stripe.Metadata
    expect(resolveOrgIdFromMetadata(md)).toBe('org-123')
  })

  it('falls back to orbya_organization_id (legacy)', () => {
    const md = { orbya_organization_id: 'org-legacy' } as unknown as Stripe.Metadata
    expect(resolveOrgIdFromMetadata(md)).toBe('org-legacy')
  })

  it('prefers organization_id over legacy key', () => {
    const md = {
      organization_id: 'new',
      orbya_organization_id: 'old',
    } as unknown as Stripe.Metadata
    expect(resolveOrgIdFromMetadata(md)).toBe('new')
  })

  it('returns null for missing, empty, or null metadata', () => {
    expect(resolveOrgIdFromMetadata(null)).toBeNull()
    expect(resolveOrgIdFromMetadata({} as Stripe.Metadata)).toBeNull()
    expect(resolveOrgIdFromMetadata({ organization_id: '' } as unknown as Stripe.Metadata)).toBeNull()
  })
})
