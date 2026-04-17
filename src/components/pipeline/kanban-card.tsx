'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { Lead } from '@/types'

interface KanbanCardProps {
  lead: Lead
  isDragging?: boolean
}

export function KanbanCard({ lead, isDragging }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: 'var(--border)' }}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-lg border bg-[var(--surface-1)] p-2.5 shadow-sm select-none cursor-grab active:cursor-grabbing transition-all hover:shadow-md',
        (isDragging || isSortDragging) && 'opacity-40 shadow-lg ring-2 ring-primary/30'
      )}
    >
      <Link
        href={`/leads/${lead.id}`}
        onClick={(e) => e.stopPropagation()}
        className="block"
        tabIndex={-1}
      >
        <p
          className="text-[14px] font-semibold leading-tight truncate group-hover:text-[var(--primary)] transition-colors text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {lead.decisor_nome}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">{lead.empresa_nome}</p>
      </Link>

      <div className="flex items-center justify-between mt-2 gap-1">
        {lead.segmento && (
          <span
            className="text-[10px] rounded px-1.5 py-0.5 truncate max-w-[90px] font-medium"
            style={{
              backgroundColor: 'color-mix(in oklab, #3B82F6 10%, transparent)',
              color: '#3B82F6',
            }}
          >
            {lead.segmento}
          </span>
        )}
        <div
          className="flex items-center gap-0.5 ml-auto rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor: 'color-mix(in oklab, #F59E0B 12%, transparent)',
            color: '#F59E0B',
          }}
        >
          <Star className="h-3 w-3" strokeWidth={2.5} fill="currentColor" />
          {lead.lead_score}
        </div>
      </div>
    </div>
  )
}
