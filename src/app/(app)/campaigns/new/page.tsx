import { Header } from '@/components/layout/header'
import { CampaignWizard } from '@/components/campaigns/campaign-wizard'

export default function NewCampaignPage() {
  return (
    <>
      <Header title="Nova campanha" />
      <div className="p-6 max-w-3xl">
        <CampaignWizard />
      </div>
    </>
  )
}
