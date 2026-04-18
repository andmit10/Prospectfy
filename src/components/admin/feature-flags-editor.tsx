'use client'

import { useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Flag, Plus, X, Search, Loader2 } from 'lucide-react'

const ALL_PLANS = ['trial', 'starter', 'pro', 'business', 'agency', 'enterprise'] as const

type Flag = {
  key: string
  description: string
  globally_enabled: boolean
  enabled_for_plans: string[] | null
  enabled_for_orgs: string[] | null
}

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

  if (isLoading)
    return <p className="text-sm text-[var(--text-tertiary)]">Carregando flags...</p>

  return (
    <div className="space-y-2">
      {((flags ?? []) as unknown as Flag[]).map((f) => {
        const enabledPlans = f.enabled_for_plans ?? []
        const enabledOrgs = f.enabled_for_orgs ?? []
        return (
          <div
            key={f.key}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5 text-[var(--primary)]" />
                  <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {f.key}
                  </p>
                  {f.globally_enabled && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      global
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{f.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  update.mutate({
                    key: f.key,
                    globallyEnabled: !f.globally_enabled,
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
                      update.mutate({ key: f.key, enabledForPlans: next })
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

            {/* Org overrides */}
            <OrgOverridesRow
              flagKey={f.key}
              orgIds={enabledOrgs}
              onChange={(next) => update.mutate({ key: f.key, enabledForOrgs: next })}
              pending={update.isPending}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Per-org override row. Shows current orgs as removable chips + a compact
 * "Adicionar" button that reveals an inline search (debounced via tRPC
 * listOrgs) so super-admins don't need to touch SQL anymore.
 */
function OrgOverridesRow({
  flagKey,
  orgIds,
  onChange,
  pending,
}: {
  flagKey: string
  orgIds: string[]
  onChange: (next: string[]) => void
  pending: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch chip labels — only when there are orgs to resolve. Cached per-flag.
  const chipQuery = trpc.admin.listOrgs.useQuery(
    { limit: 200 },
    { enabled: orgIds.length > 0, staleTime: 60_000 }
  )
  const chipMap = useMemo(() => {
    const m = new Map<string, { name: string; slug: string }>()
    for (const o of (chipQuery.data ?? []) as Array<{
      id: string
      name: string
      slug: string
    }>) {
      m.set(o.id, { name: o.name, slug: o.slug })
    }
    return m
  }, [chipQuery.data])

  // Search for the add dropdown
  const searchQuery = trpc.admin.listOrgs.useQuery(
    { search: search || undefined, limit: 10 },
    { enabled: adding, staleTime: 5_000 }
  )
  const searchResults = ((searchQuery.data ?? []) as Array<{
    id: string
    name: string
    slug: string
    plan: string
  }>).filter((o) => !orgIds.includes(o.id))

  function removeOrg(id: string) {
    onChange(orgIds.filter((x) => x !== id))
  }
  function addOrg(id: string) {
    onChange([...orgIds, id])
    setSearch('')
    setAdding(false)
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
        Orgs específicas:
      </span>

      {orgIds.length === 0 && !adding && (
        <span className="text-[11px] italic text-[var(--text-tertiary)]">nenhuma</span>
      )}

      {orgIds.map((id) => {
        const info = chipMap.get(id)
        const label = info ? info.name : id.slice(0, 8) + '…'
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{
              borderColor: 'color-mix(in oklab, #F59E0B 30%, var(--border))',
              backgroundColor: 'color-mix(in oklab, #F59E0B 8%, transparent)',
              color: 'var(--text-primary)',
            }}
            title={id}
          >
            {label}
            <button
              type="button"
              onClick={() => removeOrg(id)}
              disabled={pending}
              className="rounded-full hover:bg-black/5"
              aria-label={`Remover ${label} de ${flagKey}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Plus className="h-3 w-3" /> Adicionar org
        </button>
      ) : (
        <div
          className="relative w-72 rounded-lg border"
          style={{ borderColor: 'var(--primary)', backgroundColor: 'var(--surface-1)' }}
        >
          <div className="flex items-center gap-1.5 border-b px-2" style={{ borderColor: 'var(--border)' }}>
            <Search className="h-3 w-3 text-[var(--text-tertiary)]" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar org por nome ou slug…"
              className="h-7 border-0 text-xs focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setSearch('')
              }}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              aria-label="Cancelar"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {searchQuery.isLoading && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-[var(--text-tertiary)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
              </div>
            )}
            {!searchQuery.isLoading && searchResults.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-[var(--text-tertiary)]">
                Nenhuma org encontrada
              </p>
            )}
            {searchResults.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => addOrg(o.id)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-2)]"
              >
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-[var(--text-primary)]">{o.name}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {o.slug}
                  </span>
                </div>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {o.plan}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
