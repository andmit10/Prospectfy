import { Header } from '@/components/layout/header'
import { LeadDetail } from '@/components/leads/lead-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <>
      <Header title="Detalhe do lead" />
      <div className="p-6">
        <LeadDetail id={id} />
      </div>
    </>
  )
}
