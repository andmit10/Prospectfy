import { Header } from '@/components/layout/header'
import { AgentDetail } from '@/components/agents/agent-detail'

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
        <AgentDetail agentId={id} />
      </div>
    </>
  )
}
