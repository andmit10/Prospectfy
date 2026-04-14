import { Header } from '@/components/layout/header'
import { LeadsTable } from '@/components/leads/leads-table'

export default function LeadsPage() {
  return (
    <>
      <Header title="Leads" />
      <div className="p-6">
        <LeadsTable />
      </div>
    </>
  )
}
