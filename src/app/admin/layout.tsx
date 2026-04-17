import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Shield, Building2, DollarSign, Flag, Home } from 'lucide-react'

/**
 * Super-admin layout. Gates the entire /admin tree:
 *   - requires auth (redirects to /login)
 *   - requires super_admin membership anywhere (redirects to /dashboard)
 *
 * This is the first of three security gates:
 *   1. Layout gate (here) — catches unauthed + non-admin users before JS loads
 *   2. tRPC `superAdminProcedure` — verifies each call server-side
 *   3. RLS policies on admin tables — via `public.is_platform_admin()`
 */

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Admin sidebar — intentionally different look from the tenant sidebar
          so staff always know they're in the ops console. */}
      <aside
        className="flex w-60 flex-col border-r"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
        }}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: '#1e293b' }}>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#7c3aed' }}
          >
            <Shield className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">Orbya Admin</p>
            <p className="mt-0.5 text-[10px] text-slate-400">operações da plataforma</p>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 text-sm">
          <AdminNavLink href="/admin" icon={Home}>
            Visão geral
          </AdminNavLink>
          <AdminNavLink href="/admin/orgs" icon={Building2}>
            Organizações
          </AdminNavLink>
          <AdminNavLink href="/admin/finance" icon={DollarSign}>
            Financeiro
          </AdminNavLink>
          <AdminNavLink href="/admin/flags" icon={Flag}>
            Feature flags
          </AdminNavLink>
        </nav>

        <div className="border-t p-3 text-xs" style={{ borderColor: '#1e293b' }}>
          <Link
            href="/dashboard"
            className="block rounded-md px-2 py-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            ← Sair do admin
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-[var(--surface-2)]">{children}</main>
    </div>
  )
}

function AdminNavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}
