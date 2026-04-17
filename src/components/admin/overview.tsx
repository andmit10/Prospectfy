'use client'

import { trpc } from '@/lib/trpc-client'
import { Users, TrendingUp, AlertTriangle, Clock, DollarSign } from 'lucide-react'

function Card({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'default' | 'success' | 'warning'
}) {
  const color =
    tone === 'success' ? '#10b981' : tone === 'warning' ? '#f59e0b' : 'var(--primary)'
  return (
    <div
      className="group flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-[1.03]"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p
          className="text-[11px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </p>
        <p
          className="mt-0.5 text-2xl font-bold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{sub}</p>}
      </div>
    </div>
  )
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n)
}

export function AdminOverview() {
  const { data, isLoading } = trpc.admin.overview.useQuery()

  if (isLoading || !data) {
    return <div className="text-sm text-[var(--text-tertiary)]">Carregando métricas...</div>
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Contas ativas"
          value={data.totals.active.toString()}
          sub={`${data.totals.orgs} total · ${data.totals.suspended} suspensas`}
          icon={Users}
          tone="success"
        />
        <Card
          label="MRR atual"
          value={formatBrl(data.mrr.current)}
          sub={`Plano ${formatBrl(data.mrr.plan)} + Addons ${formatBrl(data.mrr.addons)}`}
          icon={DollarSign}
        />
        <Card
          label="Crescimento 30d"
          value={`${data.mrr.thirtyDayGrowth >= 0 ? '+' : ''}${data.mrr.thirtyDayGrowth.toFixed(1)}%`}
          sub="MRR vs. 30 dias atrás"
          icon={TrendingUp}
          tone={data.mrr.thirtyDayGrowth >= 0 ? 'success' : 'warning'}
        />
        <Card
          label="Em trial"
          value={data.churn.inTrial.toString()}
          sub={`${data.totals.runsLast24h} execuções de agente nas últimas 24h`}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card
          label="Pagantes"
          value={data.churn.paying.toString()}
          sub="não-trial + ativas"
          icon={Users}
          tone="success"
        />
        <Card
          label="Suspensas (30d)"
          value={data.churn.suspendedLast30.toString()}
          sub="churn últimos 30 dias"
          icon={AlertTriangle}
          tone={data.churn.suspendedLast30 > 0 ? 'warning' : 'default'}
        />
        <Card
          label="Trial expirado em breve"
          value={data.churn.inTrial.toString()}
          sub="convertem ou churnam"
          icon={Clock}
        />
      </div>

      {/* MRR sparkline — tiny ASCII-ish visual so we ship before doing a chart lib. */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <p className="mb-3 text-xs font-semibold text-[var(--text-secondary)]">
          MRR — últimos 30 dias
        </p>
        <SparklineSvg series={data.mrr.series} />
      </div>
    </div>
  )
}

function SparklineSvg({ series }: { series: Array<{ date: string; total: number }> }) {
  if (series.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)]">sem dados ainda</p>
  }
  const width = 800
  const height = 120
  const max = Math.max(...series.map((p) => p.total), 1)
  const min = 0
  const step = series.length > 1 ? width / (series.length - 1) : width
  const points = series.map((p, i) => {
    const x = i * step
    const y = height - ((p.total - min) / (max - min || 1)) * (height - 10) - 5
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-24 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Gráfico de MRR diário"
    >
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        points={points.join(' ')}
      />
      <polygon
        fill="color-mix(in oklab, var(--primary) 14%, transparent)"
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
      />
    </svg>
  )
}
