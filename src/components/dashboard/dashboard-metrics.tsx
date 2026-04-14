'use client'

import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Megaphone, MessageSquare, CalendarCheck, TrendingUp } from 'lucide-react'

export function DashboardMetrics() {
  const { data, isLoading } = trpc.dashboard.metrics.useQuery()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    )
  }

  const metrics = [
    {
      label: 'Leads ativos',
      value: data?.leadsActive ?? 0,
      sub: 'sem convertidos/perdidos',
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: 'Campanhas ativas',
      value: data?.campaignsActive ?? 0,
      sub: 'em andamento',
      icon: Megaphone,
      color: 'text-purple-600',
    },
    {
      label: 'Envios (30 dias)',
      value: data?.sentLast30 ?? 0,
      sub: `${data?.repliedLast30 ?? 0} respostas`,
      icon: MessageSquare,
      color: 'text-green-600',
    },
    {
      label: 'Reuniões (30 dias)',
      value: data?.meetingsLast30 ?? 0,
      sub: 'agendadas recentemente',
      icon: CalendarCheck,
      color: 'text-orange-600',
    },
  ]

  const replyRate =
    data && data.sentLast30 > 0
      ? ((data.repliedLast30 / data.sentLast30) * 100).toFixed(1)
      : '0'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{value.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data && data.sentLast30 > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <span>Taxa de resposta: <strong className="text-foreground">{replyRate}%</strong> nos últimos 30 dias</span>
        </div>
      )}
    </div>
  )
}
