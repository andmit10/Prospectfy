import { Header } from '@/components/layout/header'
import { IntegrationsManager } from '@/components/integrations/integrations-manager'

export default function IntegrationsPage() {
  return (
    <>
      <Header title="Canais & Integrações" />
      <div className="p-6 max-w-5xl space-y-6">
        <IntegrationsManager />
      </div>
    </>
  )
}
