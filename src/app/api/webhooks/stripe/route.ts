import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { serverEnv } from '@/lib/env.server'
import { createServiceClient } from '@/lib/supabase/service'

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
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_user_id
      if (userId && session.subscription) {
        await supabase
          .from('profiles')
          .update({
            plan: 'starter',
            stripe_subscription_id: session.subscription as string,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (userId) {
        await supabase
          .from('profiles')
          .update({ plan: 'trial', stripe_subscription_id: null, updated_at: new Date().toISOString() })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id
      if (userId) {
        const plan = sub.status === 'active' ? 'starter' : 'trial'
        await supabase
          .from('profiles')
          .update({ plan, updated_at: new Date().toISOString() })
          .eq('id', userId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
