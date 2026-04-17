import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed',
        'border-[var(--border)] bg-[var(--surface-1)]',
        className
      )}
    >
      {Icon && (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
          style={{
            backgroundColor: 'var(--surface-3)',
            border: '1px solid var(--border)',
          }}
        >
          <Icon className="h-6 w-6 text-[var(--text-tertiary)]" />
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--text-tertiary)] max-w-md mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
