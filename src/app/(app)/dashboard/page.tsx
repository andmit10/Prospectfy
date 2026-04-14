import { Header } from '@/components/layout/header'
import { DashboardMetrics } from '@/components/dashboard/dashboard-metrics'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { PipelineOverview } from '@/components/dashboard/pipeline-overview'

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <DashboardMetrics />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentActivity />
          <PipelineOverview />
        </div>
      </div>
    </>
  )
}
