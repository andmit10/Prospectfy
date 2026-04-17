import { cn } from '@/lib/utils'
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'

type StatCardTrend = {
  value: number // percentage change
  label?: string
}

type StatCardProps = {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  /** One of: success (green), warning (amber), info (blue), danger (red), neutral (muted) */
  variant?: 'success' | 'warning' | 'info' | 'danger' | 'neutral'
  trend?: StatCardTrend
  loading?: boolean
  className?: string
}

const VARIANT_STYLES = {
  success: { icon: 'text-[var(--success)]', bg: 'bg-[var(--success-muted)]' },
  warning: { icon: 'text-[var(--warning)]', bg: 'bg-[var(--warning-muted)]' },
  info: { icon: 'text-[var(--info)]', bg: 'bg-[var(--info-muted)]' },
  danger: { icon: 'text-[var(--danger)]', bg: 'bg-[var(--danger-muted)]' },
  neutral: { icon: 'text-[var(--text-secondary)]', bg: 'bg-[var(--surface-3)]' },
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = 'neutral',
  trend,
  loading,
  className,
}: StatCardProps) {
  const vs = VARIANT_STYLES[variant]

  if (loading) {
    return (
      <div
        className={cn(
          'rounded-xl border p-4 h-[108px] shimmer',
          'border-[var(--border)] bg-[var(--surface-2)]',
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'group rounded-xl border p-4 transition-all duration-200 animate-fade-in',
        'border-[var(--border)] bg-[var(--surface-2)]',
        'hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]',
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span
          className="text-[11px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-[1.03]',
              vs.bg
            )}
          >
            <Icon className={cn('h-[18px] w-[18px]', vs.icon)} strokeWidth={2.25} />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className="text-2xl font-bold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </span>
        {trend && (
          <TrendBadge value={trend.value} />
        )}
      </div>

      {sub && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{sub}</p>
      )}
    </div>
  )
}

function TrendBadge({ value }: { value: number }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  const color = value > 0
    ? 'text-[var(--success)]'
    : value < 0
    ? 'text-[var(--danger)]'
    : 'text-[var(--text-tertiary)]'

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', color)}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}
