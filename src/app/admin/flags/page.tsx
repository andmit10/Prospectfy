import { FeatureFlagsEditor } from '@/components/admin/feature-flags-editor'

export default function AdminFlagsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Feature flags</h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Ative funcionalidades por plano ou por organização específica. Leitura aberta,
          escrita restrita a super-admins.
        </p>
      </div>
      <FeatureFlagsEditor />
    </div>
  )
}
