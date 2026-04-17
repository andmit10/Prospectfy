import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Breadcrumb = { label: string; href?: string }

type PageHeaderProps = {
  title: string
  description?: string
  icon?: LucideIcon
  iconColor?: string
  breadcrumbs?: Breadcrumb[]
  actions?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  iconColor = 'var(--primary)',
  breadcrumbs,
  actions,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2 mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="hover:text-[var(--text-primary)] transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-[var(--text-secondary)]' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {Icon && (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
              style={{
                backgroundColor: `color-mix(in oklab, ${iconColor} 15%, transparent)`,
                border: `1px solid color-mix(in oklab, ${iconColor} 25%, transparent)`,
              }}
            >
              <Icon className="h-5 w-5" style={{ color: iconColor }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h1>
              {badge}
            </div>
            {description && (
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
