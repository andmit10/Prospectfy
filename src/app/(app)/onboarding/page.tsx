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
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1
            className="font-display text-3xl font-semibold text-[var(--text-primary)]"
            style={{ letterSpacing: '-0.025em' }}
          >
            Bem-vindo ao Prospectfy!
          </h1>
          <p className="mt-1 text-[var(--text-secondary)]">
            Configure sua conta em 3 passos rápidos
          </p>
        </div>
        <OnboardingWizard />
      </div>
    </div>
  )
}
