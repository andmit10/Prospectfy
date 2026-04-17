'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  Bot,
  KanbanSquare,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Logo } from '@/components/brand/logo'
import { OrgSwitcher } from '@/components/layout/org-switcher'
import { AdminSidebarLink } from '@/components/layout/admin-sidebar-link'

type NavSection = {
  title?: string
  items: Array<{
    href: string
    label: string
    icon: LucideIcon
    color: string // hex — tint for icon chip
    highlight?: boolean
    badge?: string
  }>
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: '#3B82F6' },
    ],
  },
  {
    title: 'Prospecção',
    items: [
      { href: '/generate', label: 'Gerar Leads', icon: Sparkles, color: '#F59E0B', highlight: true, badge: 'IA' },
      { href: '/leads', label: 'Leads', icon: Users, color: '#10B981' },
      { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare, color: '#8B5CF6' },
    ],
  },
  {
    title: 'Automação',
    items: [
      { href: '/campaigns', label: 'Campanhas', icon: Megaphone, color: '#F97316' },
      { href: '/agent', label: 'Agente', icon: Bot, color: '#A855F7' },
    ],
  },
  {
    title: 'Conta',
    items: [
      { href: '/settings', label: 'Configurações', icon: Settings, color: '#64748B' },
    ],
  },
]

const COLLAPSE_KEY = 'orbya-sidebar-collapsed'

/** Lazy init reads localStorage once — no effect-driven state sync. */
function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-64'
      )}
    >
      {/* Brand header — same height as page header (h-14) so borders align.
          Compact but modern: logo + stacked name/tagline that fit in 56px. */}
      <div
        className={cn(
          'relative flex h-14 items-center border-b border-[var(--border)]',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
        )}
      >
        <div className="flex shrink-0 items-center justify-center">
          <Logo size={collapsed ? 32 : 34} />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-none min-w-0">
            <span
              className="text-[17px] font-bold text-[var(--text-primary)] truncate"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              convertafy
            </span>
            <span
              className="mt-1 text-[10px] font-medium text-[var(--text-tertiary)] truncate"
              style={{ letterSpacing: '0.02em', lineHeight: 1 }}
            >
              Prospecção inteligente
            </span>
          </div>
        )}
        {/* Toggle — sits on the right edge so it never shifts on collapse */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-tertiary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Navigation — min-h-0 lets flex properly shrink so the footer stays pinned */}
      <ScrollArea className="min-h-0 flex-1 py-3">
        <nav className={cn('space-y-4', collapsed ? 'px-2' : 'px-3')}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={i} className="space-y-0.5">
              {section.title && !collapsed && (
                <p
                  className="px-2 pb-1.5 text-[11px] font-bold uppercase text-[var(--text-tertiary)]"
                  style={{
                    fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                    letterSpacing: '0.08em',
                  }}
                >
                  {section.title}
                </p>
              )}
              {/* Subtle divider when collapsed, except for the very first group */}
              {section.title && collapsed && i > 0 && (
                <div className="mx-auto mb-1 mt-1 h-px w-6 bg-[var(--border)]" aria-hidden />
              )}
              {section.items.map(({ href, label, icon: Icon, color, highlight, badge }) => {
                const isActive = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    style={{
                      fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                      letterSpacing: '-0.01em',
                    }}
                    className={cn(
                      'group relative flex items-center rounded-xl transition-all',
                      collapsed ? 'h-10 w-10 mx-auto justify-center' : 'gap-3 px-2.5 py-2 text-[15px] font-semibold',
                      isActive && 'bg-[var(--surface-3)] text-[var(--text-primary)] shadow-sm',
                      !isActive && highlight && 'text-[var(--text-primary)] hover:bg-[var(--surface-2)]',
                      !isActive && !highlight && 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]'
                    )}
                  >
                    {isActive && !collapsed && (
                      <span
                        className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                    )}
                    {/* Colored icon chip */}
                    <span
                      className={cn(
                        'flex shrink-0 items-center justify-center rounded-lg transition-all',
                        collapsed ? 'h-7 w-7' : 'h-8 w-8',
                        isActive ? 'scale-[1.03] shadow-sm' : 'group-hover:scale-[1.03]'
                      )}
                      style={{
                        backgroundColor: isActive
                          ? `color-mix(in oklab, ${color} 22%, transparent)`
                          : `color-mix(in oklab, ${color} 12%, transparent)`,
                        color,
                      }}
                    >
                      <Icon className={cn(collapsed ? 'h-4 w-4' : 'h-[18px] w-[18px]')} strokeWidth={2.25} />
                    </span>
                    {!collapsed && <span className="flex-1 truncate">{label}</span>}
                    {badge && !isActive && !collapsed && (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none text-white"
                        style={{ backgroundColor: color }}
                      >
                        {badge}
                      </span>
                    )}
                    {/* Small badge dot when collapsed */}
                    {badge && collapsed && (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--primary)] ring-2 ring-[var(--sidebar)]"
                        aria-hidden
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* Admin link — only rendered if the user is a super_admin. */}
          <AdminSidebarLink collapsed={collapsed} />
        </nav>
      </ScrollArea>

      {/* Footer — plan badge + single account menu (org switcher + user + logout all inside).
          `shrink-0` so ScrollArea compresses instead of the footer. */}
      <div className={cn('shrink-0 border-t border-[var(--border)] space-y-1.5', collapsed ? 'p-2' : 'p-2.5')}>
        {/* Plan badge */}
        {collapsed ? (
          <Link
            href="/settings"
            title="Plano Trial — clique para upgrade"
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)]"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-[var(--primary)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
            </span>
          </Link>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 border border-[var(--border)]">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-[var(--primary)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
            </span>
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Plano Trial
            </span>
            <Link
              href="/settings"
              className="ml-auto text-[10px] font-semibold text-[var(--primary)] hover:underline"
            >
              Upgrade
            </Link>
          </div>
        )}

        {/* Unified account menu — org + user + logout all in one dropdown */}
        <OrgSwitcher collapsed={collapsed} />
      </div>
    </aside>
  )
}
