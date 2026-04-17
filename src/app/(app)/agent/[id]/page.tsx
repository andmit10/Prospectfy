import { Header } from '@/components/layout/header'
import { AgentDetail } from '@/components/agents/agent-detail'
import { ErrorBoundary } from '@/components/ui/error-boundary'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <Header title="Agente" />
      <div className="p-6 max-w-6xl">
        <ErrorBoundary label="o agente">
          <AgentDetail agentId={id} />
        </ErrorBoundary>
      </div>
    </>
  )
}
