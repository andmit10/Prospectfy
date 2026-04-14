import { router, protectedProcedure } from '@/lib/trpc'
import { serverEnv } from '@/lib/env.server'
import { clientEnv } from '@/lib/env'
import Stripe from 'stripe'

function getStripe() {
  if (!serverEnv.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurado. Adicione ao .env.local para habilitar billing.')
  }
  return new Stripe(serverEnv.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
}

// R$197/month — create this product+price once in Stripe dashboard and set env var
// STRIPE_PRICE_ID=price_xxx
const PRICE_ID = process.env.STRIPE_PRICE_ID ?? ''

export const stripeRouter = router({
  createCheckoutSession: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()

    // Get or create Stripe customer
    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', ctx.user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: ctx.user.email!,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: ctx.user.id },
      })
      customerId = customer.id

      await ctx.supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', ctx.user.id)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard?billing=success`,
      cancel_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?billing=cancelled`,
      locale: 'pt-BR',
      metadata: { supabase_user_id: ctx.user.id },
      subscription_data: { metadata: { supabase_user_id: ctx.user.id } },
    })

    return { url: session.url! }
  }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()

    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', ctx.user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      throw new Error('Nenhuma assinatura encontrada')
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings`,
    })

    return { url: session.url }
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const { data: profile } = await ctx.supabase
      .from('profiles')
      .select('plan, stripe_subscription_id')
      .eq('id', ctx.user.id)
      .single()

    return { plan: profile?.plan ?? 'trial', hasSubscription: !!profile?.stripe_subscription_id }
  }),
})
