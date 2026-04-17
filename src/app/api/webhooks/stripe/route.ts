import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { serverEnv } from '@/lib/env.server'
import { createServiceClient } from '@/lib/supabase/service'
import { childLogger } from '@/lib/logger'
import { mapPriceToPlan, resolveOrgIdFromMetadata } from '@/server/services/stripe-helpers'

const log = childLogger('webhook:stripe')

/**
 * Stripe webhook handler — hybrid billing:
 *
 *   1. Checkout completes → flip the org's `plan` and persist
 *      `stripe_subscription_id`. When the checkout session carries an
 *      `organization_id` metadata, we update the org directly; else we fall
 *      back to the legacy per-user plan (profiles.plan).
 *
 *   2. Subscription items → `plan_addons`. Every subscription item whose
 *      price matches an entry in `addon_catalog` is mirrored into a
 *      `plan_addons` row per org. When items are removed, the addon row is
 *      marked inactive. The Stripe product/price IDs are the source of truth.
 *
 *   3. Subscription deleted → flip plan to 'trial' and deactivate all addons
 *      so the MRR view reflects the lost revenue immediately.
 */

type AddonCatalogRow = {
  addon_key: string
  stripe_price_id: string | null
  display_name: string
  monthly_price_brl: number
}

async function loadAddonCatalogByPrice(
  supabase: ReturnType<typeof createServiceClient>
): Promise<Map<string, AddonCatalogRow>> {
  const { data } = await supabase
    .from('addon_catalog')
    .select('addon_key, stripe_price_id, display_name, monthly_price_brl')
    .not('stripe_price_id', 'is', null)
  const map = new Map<string, AddonCatalogRow>()
  for (const row of data ?? []) {
    if (row.stripe_price_id) map.set(row.stripe_price_id as string, row as AddonCatalogRow)
  }
  return map
}

async function syncSubscriptionAddons(args: {
  supabase: ReturnType<typeof createServiceClient>
  orgId: string
  subscription: Stripe.Subscription
}): Promise<void> {
  const catalog = await loadAddonCatalogByPrice(args.supabase)
  const items = args.subscription.items.data ?? []
  const seenKeys = new Set<string>()

  for (const item of items) {
    const priceId = item.price?.id
    if (!priceId) continue
    const entry = catalog.get(priceId)
    if (!entry) continue

    seenKeys.add(entry.addon_key)

    await args.supabase.from('plan_addons').upsert(
      {
        organization_id: args.orgId,
        addon_key: entry.addon_key,
        stripe_subscription_item_id: item.id,
        stripe_price_id: priceId,
        display_name: entry.display_name,
        monthly_price_brl: entry.monthly_price_brl,
        quantity: item.quantity ?? 1,
        active: true,
        active_from: new Date((item.created ?? Date.now() / 1000) * 1000).toISOString(),
        active_to: null,
      },
      { onConflict: 'organization_id,addon_key' }
    )
  }

  // Deactivate addons that are no longer present in the subscription.
  if (seenKeys.size === 0) {
    await args.supabase
      .from('plan_addons')
      .update({ active: false, active_to: new Date().toISOString() })
      .eq('organization_id', args.orgId)
      .eq('active', true)
  } else {
    // Fetch current active addon_keys to deactivate the missing ones.
    const { data: currentActive } = await args.supabase
      .from('plan_addons')
      .select('addon_key')
      .eq('organization_id', args.orgId)
      .eq('active', true)
    const toDeactivate = (currentActive ?? [])
      .map((r) => r.addon_key as string)
      .filter((k) => !seenKeys.has(k))
    if (toDeactivate.length > 0) {
      await args.supabase
        .from('plan_addons')
        .update({ active: false, active_to: new Date().toISOString() })
        .eq('organization_id', args.orgId)
        .in('addon_key', toDeactivate)
    }
  }
}

async function updateOrgPlan(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  plan: string,
  sub: Stripe.Subscription | null
): Promise<void> {
  await supabase
    .from('organizations')
    .update({
      plan,
      stripe_subscription_id: sub?.id ?? null,
      stripe_customer_id: (sub?.customer as string | null) ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)
}

export async function POST(request: Request) {
  if (!serverEnv.STRIPE_SECRET_KEY || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
  const body = await request.text()
  const sig = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, serverEnv.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = resolveOrgIdFromMetadata(session.metadata as Stripe.Metadata)
        const userId = session.metadata?.supabase_user_id

        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
            expand: ['items.data.price'],
          })
          // Primary price on the first item drives the plan.
          const primaryPriceId = sub.items.data[0]?.price?.id ?? null
          const plan = mapPriceToPlan(primaryPriceId)

          if (orgId) {
            await updateOrgPlan(supabase, orgId, plan, sub)
            await syncSubscriptionAddons({ supabase, orgId, subscription: sub })
          } else if (userId) {
            // Legacy user-level fallback.
            await supabase
              .from('profiles')
              .update({
                plan,
                stripe_subscription_id: sub.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = resolveOrgIdFromMetadata(sub.metadata as Stripe.Metadata)
        if (orgId) {
          const primaryPriceId = sub.items.data[0]?.price?.id ?? null
          const plan = sub.status === 'active' ? mapPriceToPlan(primaryPriceId) : 'trial'
          await updateOrgPlan(supabase, orgId, plan, sub)
          await syncSubscriptionAddons({ supabase, orgId, subscription: sub })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = resolveOrgIdFromMetadata(sub.metadata as Stripe.Metadata)
        if (orgId) {
          await updateOrgPlan(supabase, orgId, 'trial', null)
          // Deactivate all addons.
          await supabase
            .from('plan_addons')
            .update({ active: false, active_to: new Date().toISOString() })
            .eq('organization_id', orgId)
            .eq('active', true)
        }
        break
      }
    }
  } catch (err) {
    log.error('processing failed', {
      eventId: event.id,
      eventType: event.type,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
