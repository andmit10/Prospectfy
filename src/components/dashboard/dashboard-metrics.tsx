'use client'

import { trpc } from '@/lib/trpc-client'
import { StatCard } from '@/components/ui/stat-card'
import { Users, Megaphone, MessageSquare, CalendarCheck, TrendingUp } from 'lucide-react'

export function DashboardMetrics() {
  const { data, isLoading } = trpc.dashboard.metrics.useQuery()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <StatCard key={i} label="" value="" loading />)}
      </div>
    )
  }

  const replyRate =
    data && data.sentLast30 > 0
      ? (data.repliedLast30 / data.sentLast30) * 100
      : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Leads ativos"
          value={data?.leadsActive ?? 0}
          sub="sem convertidos/perdidos"
          icon={Users}
          variant="info"
        />
        <StatCard
          label="Campanhas ativas"
          value={data?.campaignsActive ?? 0}
          sub="em andamento"
          icon={Megaphone}
          variant="warning"
        />
        <StatCard
          label="Envios (30 dias)"
          value={data?.sentLast30 ?? 0}
          sub={`${data?.repliedLast30 ?? 0} respostas`}
          icon={MessageSquare}
          variant="success"
        />
        <StatCard
          label="Reuniões (30 dias)"
          value={data?.meetingsLast30 ?? 0}
          sub="agendadas recentemente"
          icon={CalendarCheck}
          variant="warning"
        />
      </div>

      {data && data.sentLast30 > 0 && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm animate-fade-in"
          style={{
            backgroundColor: 'var(--success-muted)',
            border: '1px solid color-mix(in oklab, var(--success) 20%, transparent)',
          }}
        >
          <TrendingUp className="h-4 w-4 text-[var(--success)]" />
          <span className="text-[var(--text-secondary)]">
            Taxa de resposta:{' '}
            <strong className="text-[var(--text-primary)]">{replyRate.toFixed(1)}%</strong>{' '}
            nos últimos 30 dias
          </span>
        </div>
      )}
    </div>
  )
}
