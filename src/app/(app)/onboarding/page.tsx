import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user!.id)
    .single()

  if (profile?.onboarding_completed) redirect('/dashboard')

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#F0F0F0' }}>
            Bem-vindo ao Prospectfy!
          </h1>
          <p className="mt-1" style={{ color: '#888888' }}>
            Configure sua conta em 3 passos rápidos
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </div>
  )
}
