'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { List } from 'lucide-react'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  processing: { label: 'Executando', variant: 'default' },
  completed: { label: 'Concluído', variant: 'outline' },
  failed: { label: 'Falhou', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
}

export function AgentRecentJobs() {
  const { data: jobs = [], isLoading } = trpc.agent.recentJobs.useQuery(
    { limit: 20 },
    { refetchInterval: 10_000 }
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <List className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Fila de execução</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : jobs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma tarefa na fila ainda.
          </p>
        ) : (
          <ul className="divide-y max-h-96 overflow-y-auto">
            {jobs.map((job) => {
              const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending
              const lead = job.leads as { decisor_nome?: string; empresa_nome?: string } | null
              const step = job.cadencia_steps as { step_order?: number; canal?: string } | null
              return (
                <li key={job.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {lead?.decisor_nome ?? 'Lead'}{' '}
                      <span className="text-muted-foreground font-normal">
                        · {lead?.empresa_nome ?? ''}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step ? `Step ${step.step_order} · ${step.canal}` : 'Step —'}
                      {' · '}
                      {job.attempts > 0 && (
                        <span className="text-yellow-600">{job.attempts} tentativas · </span>
                      )}
                      {formatDistanceToNow(new Date(job.scheduled_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                    {job.last_error && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">
                        {job.last_error}
                      </p>
                    )}
                  </div>
                  <Badge variant={cfg.variant} className="shrink-0 text-xs">
                    {cfg.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
