import { Header } from '@/components/layout/header'
import { SettingsForm } from '@/components/settings/settings-form'
import { createClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <>
      <Header title="Configurações" />
      <div className="p-6 max-w-2xl space-y-6">
        <SettingsForm profile={profile} />
      </div>
    </>
  )
}
