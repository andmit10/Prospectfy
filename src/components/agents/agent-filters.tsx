'use client'

import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  UserSearch,
  Search,
  Megaphone,
  BarChart3,
  MessageCircle,
  Bot,
  Target,
  Repeat,
  Smile,
} from 'lucide-react'

const FILTERS = [
  { id: 'all', label: 'Todos', color: '#64748B', Icon: LayoutGrid },
  { id: 'prospecting', label: 'Prospecção', color: '#F59E0B', Icon: UserSearch },
  { id: 'qualifying', label: 'Qualificação', color: '#8B5CF6', Icon: Target },
  { id: 'enrichment', label: 'Enriquecimento', color: '#3B82F6', Icon: Search },
  { id: 'outreach', label: 'Outreach', color: '#F97316', Icon: Megaphone },
  { id: 'follow_up', label: 'Follow-up', color: '#10B981', Icon: Repeat },
  { id: 'whatsapp', label: 'WhatsApp', color: '#10B981', Icon: MessageCircle },
  { id: 'customer_success', label: 'Customer Success', color: '#A855F7', Icon: Smile },
  { id: 'analysis', label: 'Análise', color: '#64748B', Icon: BarChart3 },
  { id: 'custom', label: 'Customizado', color: '#EF4444', Icon: Bot },
] as const

export type AgentFilter = (typeof FILTERS)[number]['id']

export function AgentFilters({
  active,
  onChange,
  counts,
}: {
  active: AgentFilter
  onChange: (f: AgentFilter) => void
  counts: Record<string, number>
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => {
        const count =
          f.id === 'all'
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[f.id] ?? 0
        const isActive = active === f.id
        // Hide filters with zero count unless they're currently active or 'all'
        if (!isActive && f.id !== 'all' && count === 0) return null
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all'
            )}
            style={
              isActive
                ? {
                    backgroundColor: `color-mix(in oklab, ${f.color} 16%, transparent)`,
                    color: f.color,
                    borderColor: `color-mix(in oklab, ${f.color} 45%, transparent)`,
                  }
                : {
                    backgroundColor: 'var(--surface-1)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border)',
                  }
            }
          >
            <f.Icon
              className="h-3 w-3"
              strokeWidth={2.5}
              style={{ color: isActive ? f.color : 'var(--text-tertiary)' }}
            />
            {f.label}
            {count > 0 && (
              <span
                className="inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                style={
                  isActive
                    ? {
                        backgroundColor: `color-mix(in oklab, ${f.color} 22%, transparent)`,
                        color: f.color,
                      }
                    : {
                        backgroundColor: 'var(--surface-2)',
                        color: 'var(--text-tertiary)',
                      }
                }
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
