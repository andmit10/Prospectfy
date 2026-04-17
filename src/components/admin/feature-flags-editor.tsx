'use client'

import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Flag } from 'lucide-react'

const ALL_PLANS = ['trial', 'starter', 'pro', 'business', 'agency', 'enterprise'] as const

export function FeatureFlagsEditor() {
  const utils = trpc.useUtils()
  const { data: flags, isLoading } = trpc.admin.listFlags.useQuery()

  const update = trpc.admin.updateFlag.useMutation({
    onSuccess: () => {
      toast.success('Flag atualizada')
      utils.admin.listFlags.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  if (isLoading) return <p className="text-sm text-[var(--text-tertiary)]">Carregando flags...</p>

  return (
    <div className="space-y-2">
      {(flags ?? []).map((f) => {
        const enabledPlans = (f.enabled_for_plans as string[]) ?? []
        return (
          <div
            key={f.key as string}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {f.key as string}
                  </p>
                  {f.globally_enabled && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      global
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{f.description as string}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update.mutate({
                    key: f.key as string,
                    globallyEnabled: !(f.globally_enabled as boolean),
                  })
                }
              >
                {f.globally_enabled ? 'Desabilitar global' : 'Habilitar global'}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Planos:
              </span>
              {ALL_PLANS.map((plan) => {
                const on = enabledPlans.includes(plan)
                return (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? enabledPlans.filter((p) => p !== plan)
                        : [...enabledPlans, plan]
                      update.mutate({ key: f.key as string, enabledForPlans: next })
                    }}
                    className="rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors"
                    style={{
                      borderColor: on ? 'var(--primary)' : 'var(--border)',
                      color: on ? 'var(--primary)' : 'var(--text-secondary)',
                      backgroundColor: on
                        ? 'color-mix(in oklab, var(--primary) 10%, transparent)'
                        : 'transparent',
                    }}
                  >
                    {plan}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
