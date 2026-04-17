import { OrgDetail } from '@/components/admin/org-detail'

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="p-6 space-y-6">
      <OrgDetail orgId={id} />
    </div>
  )
}
