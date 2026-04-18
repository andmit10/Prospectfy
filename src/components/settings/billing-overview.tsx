'use client'

import { trpc } from '@/lib/trpc-client'
import { Check, CreditCard, Loader2, Zap, Users, Database, Bot } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Tenant-facing billing overview. Shows:
 *   - Current plan from `organizations.plan`
 *   - Limits from `plan_catalog` (fetched via the organizations.current call
 *     which we'll extend to include plan metadata)
 *   - Active add-ons from `plan_addons` (via admin or channels endpoint)
 *   - Upgrade CTA hitting the existing Stripe checkout
 */

const PLAN_FEATURES: Record<string, { title: string; price: string; features: string[] }> = {
  trial: {
    title: 'Trial',
    price: 'Grátis 14 dias',
    features: ['200 leads/mês', '200k tokens IA', '1 canal', '1 KB'],
  },
  starter: {
    title: 'Starter',
    price: 'R$ 197/mês',
    features: ['1.000 leads/mês', '1M tokens IA', '2 canais', '2 KBs', 'RAG'],
  },
  pro: {
    title: 'Pro',
    price: 'R$ 397/mês',
    features: [
      '5.000 leads/mês',
      '5M tokens IA',
      '3 usuários',
      '4 canais',
      '5 KBs',
      'LinkedIn',
      'Agentes customizáveis',
    ],
  },
  business: {
    title: 'Business',
    price: 'R$ 797/mês',
    features: [
      '15.000 leads/mês',
      '15M tokens IA',
      '8 usuários',
      '15 KBs',
      'LLM local (Qwen3)',
      'Suporte prioritário',
    ],
  },
  agency: {
    title: 'Agency',
    price: 'R$ 1.497/mês',
    features: [
      '50.000 leads/mês',
      '50M tokens IA',
      '20 usuários',
      '50 KBs',
      'Multi-marca',
      'Evolution API',
    ],
  },
  enterprise: {
    title: 'Enterprise',
    price: 'Sob consulta',
    features: ['Volume customizado', 'SSO', 'Suporte dedicado', 'SLA'],
  },
}

export function BillingOverview() {
  const { data: org } = trpc.organizations.current.useQuery()

  // Checkout mutation — redirects to Stripe Checkout for the selected plan.
  // Portal mutation lets paid customers manage their subscription.
  const checkout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (e) => toast.error(e.message),
  })
  const portal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (e) => toast.error(e.message),
  })

  if (!org) {
    return (
      <div className="rounded-xl border p-6 text-sm text-[var(--text-tertiary)]"
           style={{ borderColor: 'var(--border)' }}>
        Carregando...
      </div>
    )
  }

  const currentPlan = (org.plan as string) ?? 'trial'
  const plan = PLAN_FEATURES[currentPlan] ?? PLAN_FEATURES.trial

  return (
    <>
      {/* Current plan card */}
      <div
        className="rounded-xl border p-6"
        style={{
          borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
          backgroundColor: 'color-mix(in oklab, var(--primary) 3%, var(--surface-1))',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
              Plano atual
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {plan.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{plan.price}</p>
          </div>
          {currentPlan === 'trial' ? (
            <Button variant="outline" size="sm" render={<Link href="#upgrade" />} nativeButton={false}>
              <CreditCard className="mr-1 h-3.5 w-3.5" />
              Fazer upgrade
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
            >
              {portal.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="mr-1 h-3.5 w-3.5" />
              )}
              Gerenciar assinatura
            </Button>
          )}
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Check className="h-3.5 w-3.5 text-[var(--primary)]" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Upgrade grid */}
      <div id="upgrade">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Fazer upgrade
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {['starter', 'pro', 'business', 'agency'].map((planKey) => {
            const p = PLAN_FEATURES[planKey]
            if (!p) return null
            const isCurrent = currentPlan === planKey
            return (
              <div
                key={planKey}
                className="rounded-xl border p-5"
                style={{
                  borderColor: isCurrent
                    ? 'var(--primary)'
                    : 'var(--border)',
                  backgroundColor: 'var(--surface-1)',
                  opacity: isCurrent ? 0.6 : 1,
                }}
              >
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="mt-1 text-lg font-bold">{p.price}</p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-[var(--primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? 'outline' : 'default'}
                  size="sm"
                  className="mt-4 w-full"
                  disabled={isCurrent || checkout.isPending}
                  onClick={() => {
                    if (isCurrent) return
                    checkout.mutate({
                      plan: planKey as 'starter' | 'pro' | 'business' | 'agency',
                    })
                  }}
                >
                  {checkout.isPending && checkout.variables?.plan === planKey ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Abrindo checkout...
                    </>
                  ) : isCurrent ? (
                    'Plano atual'
                  ) : (
                    'Assinar'
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        {/* Enterprise — negotiated, no self-serve checkout */}
        {currentPlan !== 'enterprise' && (
          <div
            className="mt-3 rounded-xl border p-5"
            style={{
              borderColor: 'color-mix(in oklab, var(--primary) 25%, var(--border))',
              backgroundColor:
                'color-mix(in oklab, var(--primary) 4%, var(--surface-1))',
            }}
          >
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {PLAN_FEATURES.enterprise.title}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {PLAN_FEATURES.enterprise.price} ·{' '}
                  {PLAN_FEATURES.enterprise.features.join(' · ')}
                </p>
              </div>
              <a
                href="mailto:comercial@prospectfy.com.br?subject=Interesse%20no%20plano%20Enterprise&body=Ol%C3%A1%2C%20gostaria%20de%20saber%20mais%20sobre%20o%20plano%20Enterprise%20do%20Prospectfy."
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground, #fff)',
                }}
              >
                Fale com vendas
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Add-ons */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Add-ons disponíveis
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AddonRow
            icon={Users}
            name="LinkedIn (Unipile)"
            price="R$ 99/mês"
            description="Conta LinkedIn conectada via Unipile. 1 conta por add-on."
          />
          <AddonRow
            icon={Zap}
            name="Volume LLM Premium"
            price="R$ 199/mês"
            description="+500k tokens/mês no tier premium (Claude Sonnet)."
          />
          <AddonRow
            icon={Database}
            name="KB grande"
            price="R$ 49/mês"
            description="KBs ilimitadas até 100k chunks totais."
          />
          <AddonRow
            icon={Bot}
            name="Suporte prioritário"
            price="R$ 199/mês"
            description="SLA de 4h úteis, canal dedicado."
          />
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
          Add-ons são aplicados via Stripe subscription items. Contate o suporte para ativar.
        </p>
      </div>
    </>
  )
}

function AddonRow({
  icon: Icon,
  name,
  price,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  name: string
  price: string
  description: string
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs font-bold text-[var(--primary)]">{price}</p>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
    </div>
  )
}
