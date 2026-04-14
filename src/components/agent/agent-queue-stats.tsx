'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react'

export function AgentQueueStats() {
  const { data, isLoading } = trpc.agent.queueStats.useQuery(undefined, {
    refetchInterval: 10_000,
  })

  const stats = [
    {
      label: 'Pendentes',
      value: data?.pending ?? 0,
      icon: Clock,
      color: 'text-yellow-500',
    },
    {
      label: 'Em execução',
      value: data?.processing ?? 0,
      icon: Loader2,
      color: 'text-blue-500',
    },
    {
      label: 'Concluídos',
      value: data?.completed ?? 0,
      icon: CheckCircle2,
      color: 'text-green-500',
    },
    {
      label: 'Falhos',
      value: data?.failed ?? 0,
      icon: XCircle,
      color: 'text-red-500',
    },
  ]

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Status da fila
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {isLoading ? '—' : value.toLocaleString('pt-BR')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
