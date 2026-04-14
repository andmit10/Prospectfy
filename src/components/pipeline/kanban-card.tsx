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
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group rounded-md border bg-background p-2.5 shadow-sm select-none cursor-grab active:cursor-grabbing transition-all',
        (isDragging || isSortDragging) && 'opacity-40 shadow-lg ring-2 ring-primary/30'
      )}
    >
      <Link
        href={`/leads/${lead.id}`}
        onClick={(e) => e.stopPropagation()}
        className="block"
        tabIndex={-1}
      >
        <p className="text-sm font-medium leading-tight truncate group-hover:text-primary transition-colors">
          {lead.decisor_nome}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.empresa_nome}</p>
      </Link>

      <div className="flex items-center justify-between mt-2">
        {lead.segmento && (
          <span className="text-xs bg-muted rounded px-1.5 py-0.5 truncate max-w-[80px]">
            {lead.segmento}
          </span>
        )}
        <div className="flex items-center gap-0.5 ml-auto text-xs text-muted-foreground">
          <Star className="h-3 w-3 text-yellow-500" />
          {lead.lead_score}
        </div>
      </div>
    </div>
  )
}
