'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Users, Send, MessageSquare, CalendarCheck, Play, Pause } from 'lucide-react'
import type { CampaignStatus, CadenciaStep } from '@/types'

const statusLabel: Record<CampaignStatus, string> = {
  rascunho:  'Rascunho',
  ativa:     'Ativa',
  pausada:   'Pausada',
  concluida: 'Concluída',
}

export function CampaignDetail({ id }: { id: string }) {
  const { data, isLoading } = trpc.campaigns.getById.useQuery(id)
  const utils = trpc.useUtils()

  const updateStatus = trpc.campaigns.update.useMutation({
    onSuccess: () => utils.campaigns.getById.invalidate(id),
    onError: (err) => toast.error(err.message),
  })

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Campanha não encontrada.</p>

  const steps: CadenciaStep[] = (data as { cadencia_steps?: CadenciaStep[] }).cadencia_steps ?? []
  const status = data.status as CampaignStatus
  const canActivate = status === 'rascunho' || status === 'pausada'
  const canPause = status === 'ativa'

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{data.nome}</h2>
          {data.descricao && (
            <p className="text-muted-foreground text-sm mt-1">{data.descricao}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{statusLabel[status]}</span>
          {canActivate && (
            <Button
              size="sm"
              onClick={() => updateStatus.mutate({ id, status: 'ativa' })}
              disabled={steps.length === 0 || updateStatus.isPending}
            >
              <Play className="mr-1 h-3.5 w-3.5" /> Ativar
            </Button>
          )}
          {canPause && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateStatus.mutate({ id, status: 'pausada' })}
              disabled={updateStatus.isPending}
            >
              <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
            </Button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Leads', value: data.total_leads, icon: Users },
          { label: 'Enviados', value: data.total_enviados, icon: Send },
          { label: 'Respostas', value: data.total_respondidos, icon: MessageSquare },
          { label: 'Reuniões', value: data.total_reunioes, icon: CalendarCheck },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cadência steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadência de mensagens</CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum step configurado.
            </p>
          ) : (
            <ol className="relative border-l border-border ml-3 space-y-4">
              {steps
                .sort((a, b) => a.step_order - b.step_order)
                .map((step) => (
                  <li key={step.id} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-background bg-primary/60" />
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        Step {step.step_order} · {step.canal}
                      </span>
                      {step.delay_hours > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {step.delay_hours}h após anterior
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground bg-muted rounded p-2">
                      {step.mensagem_template}
                    </p>
                  </li>
                ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
