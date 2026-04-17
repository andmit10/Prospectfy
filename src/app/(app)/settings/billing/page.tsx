import { Header } from '@/components/layout/header'
import { BillingOverview } from '@/components/settings/billing-overview'

export default function BillingPage() {
  return (
    <>
      <Header title="Plano & cobrança" />
      <div className="p-6 max-w-3xl space-y-6">
        <BillingOverview />
      </div>
    </>
  )
}
