import { AdminOrgsList } from '@/components/admin/orgs-list'

export default function AdminOrgsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Organizações</h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Lista de todas as organizações na plataforma. Impersonar para dar suporte.
        </p>
      </div>
      <AdminOrgsList />
    </div>
  )
}
