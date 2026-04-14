import { Header } from '@/components/layout/header'
import { AgentQueueStats } from '@/components/agent/agent-queue-stats'
import { AgentRecentJobs } from '@/components/agent/agent-recent-jobs'
import { AgentReasoningLog } from '@/components/agent/agent-reasoning-log'

export default function AgentPage() {
  return (
    <>
      <Header title="Agente de Prospecção" />
      <div className="p-6 space-y-6">
        <AgentQueueStats />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AgentRecentJobs />
          <AgentReasoningLog />
        </div>
      </div>
    </>
  )
}
