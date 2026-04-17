import { AdminOverview } from '@/components/admin/overview'

export default function AdminOverviewPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Visão geral</h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Métricas consolidadas da plataforma (todas as organizações).
        </p>
      </div>
      <AdminOverview />
    </div>
  )
}
