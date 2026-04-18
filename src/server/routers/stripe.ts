import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, protectedProcedure } from '@/lib/trpc'
import { serverEnv } from '@/lib/env.server'
import { clientEnv } from '@/lib/env'
import Stripe from 'stripe'

function getStripe(): Stripe {
  if (!serverEnv.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Stripe não configurado. Contate o suporte (falta STRIPE_SECRET_KEY no ambiente).',
    })
  }
  return new Stripe(serverEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
}

// Plan → env var mapping. Missing env vars throw at checkout time with a
// clear message instead of silently falling back to a random price.
function resolvePriceId(plan: string): string {
  const map: Record<string, string | undefined> = {
    starter: serverEnv.STRIPE_PRICE_STARTER,
    pro: serverEnv.STRIPE_PRICE_PRO,
    business: serverEnv.STRIPE_PRICE_BUSINESS,
    agency: serverEnv.STRIPE_PRICE_AGENCY,
  }
  const priceId = map[plan]
  if (!priceId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Plano "${plan}" ainda não está disponível para checkout. Contate comercial@prospectfy.com.br.`,
    })
  }
  return priceId
}

export const stripeRouter = router({
  /**
   * Create a checkout session for a specific plan. Requires the user to be
   * in an org (orgProcedure) so we can stamp `organization_id` on both the
   * session and subscription metadata — the webhook uses that to promote
   * the correct org's plan.
   */
  createCheckoutSession: orgProcedure
    .input(
      z.object({
        plan: z.enum(['starter', 'pro', 'business', 'agency']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe()
      const priceId = resolvePriceId(input.plan)

      // Get or create Stripe customer at the ORG level. Falls back to the
      // user's profile column for legacy data compatibility.
      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('stripe_customer_id, name, billing_email')
        .eq('id', ctx.orgId)
        .single()

      let customerId = org?.stripe_customer_id as string | null | undefined

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: (org?.billing_email as string | undefined) ?? ctx.user.email ?? undefined,
          name: (org?.name as string | undefined) ?? undefined,
          metadata: {
            organization_id: ctx.orgId,
            supabase_user_id: ctx.user.id,
          },
        })
        customerId = customer.id

        await ctx.supabase
          .from('organizations')
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq('id', ctx.orgId)
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard?billing=success`,
        cancel_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings/billing?billing=cancelled`,
        locale: 'pt-BR',
        // Webhook reads both — we stamp org_id here and on the subscription
        // so customer.subscription.updated events after the checkout also
        // know which org to update.
        metadata: {
          organization_id: ctx.orgId,
          supabase_user_id: ctx.user.id,
          plan: input.plan,
        },
        subscription_data: {
          metadata: {
            organization_id: ctx.orgId,
            supabase_user_id: ctx.user.id,
            plan: input.plan,
          },
        },
      })

      return { url: session.url! }
    }),

  /**
   * Open the Stripe billing portal so the customer can manage their
   * subscription (change plan, update card, cancel). Needs a customer id
   * already on the org — that only exists after the first checkout.
   */
  createPortalSession: orgProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', ctx.orgId)
      .single()

    const customerId = org?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Nenhuma assinatura ativa ainda. Faça upgrade primeiro.',
      })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings/billing`,
    })

    return { url: session.url }
  }),

  /**
   * Current subscription state — reads from the ORG (source of truth for
   * tenant-level billing). Kept as `protectedProcedure` (not orgProcedure)
   * for callers that might not have an org context yet.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    // Try to resolve the caller's current org; fall back to the legacy
    // profile-level plan if there isn't one yet.
    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('current_organization_id, plan, stripe_subscription_id')
      .eq('id', ctx.user.id)
      .single()

    const orgId = profile?.current_organization_id as string | undefined
    if (orgId) {
      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('plan, stripe_subscription_id')
        .eq('id', orgId)
        .single()
      if (org) {
        return {
          plan: (org.plan as string) ?? 'trial',
          hasSubscription: !!org.stripe_subscription_id,
        }
      }
    }

    return {
      plan: (profile?.plan as string) ?? 'trial',
      hasSubscription: !!profile?.stripe_subscription_id,
    }
  }),
})
