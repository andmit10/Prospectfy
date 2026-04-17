import { Header } from '@/components/layout/header'
import { AgentGrid } from '@/components/agents/agent-grid'
import { AgentQueueStats } from '@/components/agent/agent-queue-stats'

export default function AgentPage() {
  return (
    <>
      <Header title="Agentes de IA" />
      <div className="p-6 space-y-8">
        <AgentGrid />

        {/* Legacy queue stats retained during the v1→v2 migration window. */}
        <details className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[var(--text-tertiary)]">
            Fila de execução legada (v1)
          </summary>
          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <AgentQueueStats />
          </div>
        </details>
      </div>
    </>
  )
}
