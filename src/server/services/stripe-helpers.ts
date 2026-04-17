import type Stripe from 'stripe'

/**
 * Map a primary Stripe price id to an Orbya plan. Ops populates this via
 * `STRIPE_PRICE_*` env vars; missing matches fall through to 'starter'
 * so the customer still gets access until the mapping catches up.
 */
export function mapPriceToPlan(
  priceId: string | null,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!priceId) return 'starter'
  const envMap: Array<[string | undefined, string]> = [
    [env.STRIPE_PRICE_STARTER, 'starter'],
    [env.STRIPE_PRICE_PRO, 'pro'],
    [env.STRIPE_PRICE_BUSINESS, 'business'],
    [env.STRIPE_PRICE_AGENCY, 'agency'],
    [env.STRIPE_PRICE_ENTERPRISE, 'enterprise'],
  ]
  for (const [envPrice, plan] of envMap) {
    if (envPrice && priceId === envPrice) return plan
  }
  return 'starter'
}

export function resolveOrgIdFromMetadata(metadata: Stripe.Metadata | null): string | null {
  if (!metadata) return null
  const id = metadata.organization_id ?? metadata.orbya_organization_id
  return typeof id === 'string' && id.length > 0 ? id : null
}
