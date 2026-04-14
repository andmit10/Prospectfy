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
        'flex w-56 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/30 transition-colors',
        column.color,
        isOver && 'bg-muted/60 ring-2 ring-primary/30'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">{column.label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {leads.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-2 flex-1 min-h-[100px]">
        {children}
      </div>
    </div>
  )
}
