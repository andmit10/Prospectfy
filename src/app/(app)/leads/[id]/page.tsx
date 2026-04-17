import { Header } from '@/components/layout/header'
import { LeadDetail } from '@/components/leads/lead-detail'
import { ErrorBoundary } from '@/components/ui/error-boundary'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <>
      <Header title="Detalhe do lead" />
      <div className="p-6">
        <ErrorBoundary label="o detalhe do lead">
          <LeadDetail id={id} />
        </ErrorBoundary>
      </div>
    </>
  )
}
