import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { SettingsForm } from '@/components/settings/settings-form'
import { ThemeSelector } from '@/components/theme/theme-selector'
import { createClient } from '@/lib/supabase/server'
import { Users, CreditCard, Building2, Plug, ChevronRight } from 'lucide-react'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <>
      <Header title="Configurações" />
      <div className="p-6 max-w-3xl space-y-6">
        {/* Quick nav to the split pages */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SettingsCard
            href="/settings/team"
            icon={Users}
            color="#10B981"
            title="Time & Organização"
            description="Membros, convites e permissões"
          />
          <SettingsCard
            href="/settings/integrations"
            icon={Plug}
            color="#8B5CF6"
            title="Canais & Integrações"
            description="WhatsApp, Email, LinkedIn, Instagram"
          />
          <SettingsCard
            href="/settings/billing"
            icon={CreditCard}
            color="#F97316"
            title="Plano & cobrança"
            description="Upgrade de plano e add-ons"
          />
          <SettingsCard
            href="/settings/organizations/new"
            icon={Building2}
            color="#3B82F6"
            title="Nova organização"
            description="Criar outro workspace"
          />
        </div>

        <SettingsForm profile={profile} />

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <ThemeSelector />
        </div>
      </div>
    </>
  )
}

function SettingsCard({
  href,
  icon: Icon,
  color,
  title,
  description,
}: {
  href: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  color: string
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-sm"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface-1)',
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-[1.03]"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
          color,
        }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-[15px] font-semibold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
      </div>
      <ChevronRight
        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        style={{ color }}
      />
    </Link>
  )
}
