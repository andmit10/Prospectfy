'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

const tipoLabel: Record<string, string> = {
  enviado:   'Mensagem enviada para',
  entregue:  'Mensagem entregue para',
  lido:      'Mensagem lida por',
  respondido:'Resposta recebida de',
  reuniao:   'Reunião agendada com',
  erro:      'Erro ao enviar para',
}

const tipoColor: Record<string, string> = {
  enviado:   '#3B82F6',
  entregue:  '#64748B',
  lido:      '#A855F7',
  respondido:'#10B981',
  reuniao:   '#F97316',
  erro:      '#EF4444',
}

export function RecentActivity() {
  const { data, isLoading } = trpc.dashboard.recentActivity.useQuery()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle
          className="text-[15px] font-semibold"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          Atividade recente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nenhuma atividade ainda"
            description="Gere seus primeiros leads e ative uma campanha para o agente começar a prospectar via WhatsApp."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/generate"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Sparkles className="h-3 w-3" />
                  Gerar leads
                </Link>
                <Link
                  href="/campaigns/new"
                  className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                >
                  Criar campanha
                </Link>
              </div>
            }
            className="py-8"
          />
        ) : (
          data.map((item) => {
            const lead = item.leads as { decisor_nome: string; empresa_nome: string } | null | undefined
            const c = tipoColor[item.tipo] ?? '#64748B'
            return (
              <div key={item.id} className="flex items-start gap-3 text-sm">
                <span
                  className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${c} 12%, transparent)`,
                    color: c,
                    letterSpacing: '0.05em',
                  }}
                >
                  {item.tipo}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">
                    {tipoLabel[item.tipo] ?? item.tipo}{' '}
                    <strong>{lead?.decisor_nome}</strong>
                    {lead?.empresa_nome ? ` (${lead.empresa_nome})` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
