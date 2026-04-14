'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Lead, PipelineStatus } from '@/types'

const COLUMNS: { key: PipelineStatus; label: string; color: string }[] = [
  { key: 'novo',       label: 'Novo',       color: 'border-t-slate-400' },
  { key: 'contatado',  label: 'Contatado',  color: 'border-t-blue-400' },
  { key: 'respondeu',  label: 'Respondeu',  color: 'border-t-yellow-400' },
  { key: 'reuniao',    label: 'Reunião',    color: 'border-t-purple-400' },
  { key: 'convertido', label: 'Convertido', color: 'border-t-green-400' },
  { key: 'perdido',    label: 'Perdido',    color: 'border-t-red-400' },
]

export function KanbanBoard() {
  const [activeId, setActiveId] = useState<string | null>(null)

  const { data, isLoading } = trpc.leads.list.useQuery({ page: 1, pageSize: 500 })
  const utils = trpc.useUtils()
  const updateLead = trpc.leads.update.useMutation({
    onError: (err) => {
      toast.error('Erro ao mover lead: ' + err.message)
      utils.leads.list.invalidate()
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const leads = (data?.leads ?? []) as Lead[]
  const byStatus = Object.fromEntries(
    COLUMNS.map(({ key }) => [key, leads.filter((l) => l.status_pipeline === key)])
  ) as Record<PipelineStatus, Lead[]>

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // over.id is either a column key or a lead id — resolve to column
    const targetColumn =
      COLUMNS.find((c) => c.key === over.id)?.key ??
      leads.find((l) => l.id === over.id)?.status_pipeline

    if (!targetColumn) return

    const lead = leads.find((l) => l.id === active.id)
    if (!lead || lead.status_pipeline === targetColumn) return

    // Optimistic update
    utils.leads.list.setData({ page: 1, pageSize: 500 }, (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        leads: prev.leads.map((l) =>
          l.id === lead.id ? { ...l, status_pipeline: targetColumn } : l
        ),
      }
    })

    updateLead.mutate({ id: lead.id, status_pipeline: targetColumn })
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((c) => <Skeleton key={c.key} className="h-96 w-56 shrink-0" />)}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.key} column={col} leads={byStatus[col.key] ?? []}>
            <SortableContext
              items={(byStatus[col.key] ?? []).map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {(byStatus[col.key] ?? []).map((lead) => (
                <KanbanCard key={lead.id} lead={lead} />
              ))}
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>

      <DragOverlay>
        {activeLead ? <KanbanCard lead={activeLead} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
