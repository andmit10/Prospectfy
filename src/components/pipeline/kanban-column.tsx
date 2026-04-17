'use client'

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import type { Lead, PipelineStatus } from '@/types'

interface KanbanColumnProps {
  column: { key: PipelineStatus; label: string; color: string }
  leads: Lead[]
  children: React.ReactNode
}

export function KanbanColumn({ column, leads, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-56 shrink-0 flex-col rounded-xl border bg-[var(--surface-1)] transition-all',
        isOver && 'ring-2 ring-offset-1'
      )}
      style={{
        borderColor: 'var(--border)',
        borderTopWidth: 3,
        borderTopColor: column.color,
        ...(isOver && { boxShadow: `0 0 0 2px color-mix(in oklab, ${column.color} 30%, transparent)` }),
      }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span
          className="text-[13px] font-bold uppercase"
          style={{
            color: column.color,
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.06em',
          }}
        >
          {column.label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor: `color-mix(in oklab, ${column.color} 14%, transparent)`,
            color: column.color,
          }}
        >
          {leads.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2 flex-1 min-h-[100px]">
        {children}
      </div>
    </div>
  )
}
