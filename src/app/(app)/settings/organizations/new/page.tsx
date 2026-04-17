import { Header } from '@/components/layout/header'
import { NewOrganizationForm } from '@/components/settings/new-organization-form'

export default function NewOrganizationPage() {
  return (
    <>
      <Header title="Nova organização" />
      <div className="p-6 max-w-xl">
        <NewOrganizationForm />
      </div>
    </>
  )
}
