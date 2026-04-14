import { Header } from '@/components/layout/header'
import { CampaignDetail } from '@/components/campaigns/campaign-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <>
      <Header title="Detalhe da campanha" />
      <div className="p-6">
        <CampaignDetail id={id} />
      </div>
    </>
  )
}
