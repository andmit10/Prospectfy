'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Brain } from 'lucide-react'

export function AgentReasoningLog() {
  const { data: logs = [], isLoading } = trpc.agent.recentReasoning.useQuery(
    { limit: 10 },
    { refetchInterval: 15_000 }
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Raciocínio do agente</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : logs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum log de raciocínio ainda. O agente irá registrar decisões aqui após processar leads.
          </p>
        ) : (
          <ul className="divide-y max-h-96 overflow-y-auto">
            {logs.map((log) => {
              const lead = log.leads as { decisor_nome?: string; empresa_nome?: string } | null
              return (
                <li key={log.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {lead?.decisor_nome ?? 'Lead'}{' '}
                      <span className="text-muted-foreground font-normal">
                        · {lead?.empresa_nome ?? ''}
                      </span>
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  {log.agent_reasoning && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 bg-muted/50 rounded p-2">
                      {log.agent_reasoning}
                    </p>
                  )}
                  {log.mensagem_enviada && (
                    <p className="text-xs border-l-2 border-primary/40 pl-2 text-foreground/80 line-clamp-2">
                      &ldquo;{log.mensagem_enviada}&rdquo;
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
