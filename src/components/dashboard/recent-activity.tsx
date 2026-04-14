'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const tipoLabel: Record<string, string> = {
  enviado:   'Mensagem enviada para',
  entregue:  'Mensagem entregue para',
  lido:      'Mensagem lida por',
  respondido:'Resposta recebida de',
  reuniao:   'Reunião agendada com',
  erro:      'Erro ao enviar para',
}

const tipoColor: Record<string, string> = {
  enviado:   'bg-blue-100 text-blue-700',
  entregue:  'bg-slate-100 text-slate-600',
  lido:      'bg-purple-100 text-purple-700',
  respondido:'bg-green-100 text-green-700',
  erro:      'bg-red-100 text-red-700',
}

export function RecentActivity() {
  const { data, isLoading } = trpc.dashboard.recentActivity.useQuery()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Atividade recente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade ainda. Ative uma campanha para começar.
          </p>
        ) : (
          data.map((item) => {
            const lead = item.leads as { decisor_nome: string; empresa_nome: string } | null | undefined
            return (
              <div key={item.id} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tipoColor[item.tipo] ?? 'bg-slate-100 text-slate-600'}`}>
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
