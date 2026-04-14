import { Header } from '@/components/layout/header'
import { KanbanBoard } from '@/components/pipeline/kanban-board'

export default function PipelinePage() {
  return (
    <>
      <Header title="Pipeline" />
      <div className="p-6 overflow-hidden">
        <KanbanBoard />
      </div>
    </>
  )
}
