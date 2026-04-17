'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { UserCheck, PauseCircle, PlayCircle, Eye, Shield } from 'lucide-react'

export function AdminOrgsList() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showSuspended, setShowSuspended] = useState<boolean | undefined>(undefined)

  const { data: orgs, isLoading } = trpc.admin.listOrgs.useQuery({
    search: search || undefined,
    suspended: showSuspended,
  })

  const utils = trpc.useUtils()
  const suspend = trpc.admin.suspendOrg.useMutation({
    onSuccess: () => {
      toast.success('Organização suspensa')
      utils.admin.listOrgs.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })
  const resume = trpc.admin.resumeOrg.useMutation({
    onSuccess: () => {
      toast.success('Organização reativada')
      utils.admin.listOrgs.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })
  const impersonate = trpc.admin.beginImpersonation.useMutation({
    onSuccess: () => {
      toast.success('Sessão de impersonation aberta')
      router.push('/dashboard')
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou slug..."
          className="max-w-sm"
        />
        <div className="flex items-center gap-1 text-xs">
          <Button
            variant={showSuspended === undefined ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowSuspended(undefined)}
          >
            Todas
          </Button>
          <Button
            variant={showSuspended === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowSuspended(false)}
          >
            Ativas
          </Button>
          <Button
            variant={showSuspended === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowSuspended(true)}
          >
            Suspensas
          </Button>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left text-[11px] font-bold uppercase text-[var(--text-tertiary)]"
              style={{
                borderColor: 'var(--border)',
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '0.08em',
              }}
            >
              <th className="px-4 py-3">Organização</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criada</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-[var(--text-tertiary)]">
                  Carregando...
                </td>
              </tr>
            ) : (orgs ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-[var(--text-tertiary)]">
                  Nenhuma organização encontrada.
                </td>
              </tr>
            ) : (
              (orgs ?? []).map((o) => {
                const suspended = Boolean(o.suspended_at)
                return (
                  <tr
                    key={o.id as string}
                    className="border-b last:border-b-0 hover:bg-[var(--surface-2)]"
                    style={{ borderColor: 'var(--border)', opacity: suspended ? 0.65 : 1 }}
                  >
                    <td className="px-4 py-3">
                      <p
                        className="text-[15px] font-semibold text-[var(--text-primary)]"
                        style={{
                          fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {o.name as string}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">{o.slug as string}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                        style={{
                          backgroundColor: 'color-mix(in oklab, #3B82F6 12%, transparent)',
                          color: '#3B82F6',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {o.plan as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {suspended ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={{
                            backgroundColor: 'color-mix(in oklab, #F59E0B 12%, transparent)',
                            color: '#F59E0B',
                            letterSpacing: '0.05em',
                          }}
                        >
                          <PauseCircle className="h-3 w-3" strokeWidth={2.5} />
                          Suspensa
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={{
                            backgroundColor: 'color-mix(in oklab, #10B981 12%, transparent)',
                            color: '#10B981',
                            letterSpacing: '0.05em',
                          }}
                        >
                          <PlayCircle className="h-3 w-3" strokeWidth={2.5} />
                          Ativa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-tertiary)]">
                      {new Date(o.created_at as string).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => router.push(`/admin/orgs/${o.id}`)}
                          title="Detalhes"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const reason = prompt(
                              `Por que você precisa impersonar "${o.name}"? (mín. 10 caracteres)`
                            )
                            if (!reason || reason.length < 10) return
                            impersonate.mutate({ targetOrgId: o.id as string, reason })
                          }}
                          title="Impersonar"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                        </Button>
                        {suspended ? (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => resume.mutate({ id: o.id as string })}
                            title="Reativar"
                          >
                            <PlayCircle className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const reason = prompt('Motivo da suspensão:')
                              if (!reason || reason.length < 5) return
                              suspend.mutate({ id: o.id as string, reason })
                            }}
                            title="Suspender"
                          >
                            <Shield className="h-3.5 w-3.5 text-amber-600" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
