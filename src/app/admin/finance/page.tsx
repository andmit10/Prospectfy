import { AdminOverview } from '@/components/admin/overview'

/**
 * Finance page — for now reuses the overview's MRR charts. Phase 6.1 will
 * add a real financial breakdown: cohort analysis, LTV, churn by cohort,
 * outstanding invoices.
 */
export default function AdminFinancePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Financeiro</h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Receita recorrente, add-ons, cupons e ajustes de crédito.
        </p>
      </div>
      <AdminOverview />
    </div>
  )
}
