import { Header } from '@/components/layout/header'
import { CampaignsList } from '@/components/campaigns/campaigns-list'

export default function CampaignsPage() {
  return (
    <>
      <Header title="Campanhas" />
      <div className="p-6">
        <CampaignsList />
      </div>
    </>
  )
}
