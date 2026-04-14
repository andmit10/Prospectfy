'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Settings,
  Bot,
  LogOut,
  KanbanSquare,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/agent', label: 'Agente', icon: Bot },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="flex h-full w-60 flex-col"
      style={{
        backgroundColor: '#111111',
        borderRight: '1px solid #1E1E1E',
      }}
    >
      {/* Logo */}
      <div
        className="flex h-14 items-center gap-2 px-4"
        style={{ borderBottom: '1px solid #1E1E1E' }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: '#00D26A' }}
        >
          <Zap className="h-4 w-4" style={{ color: '#0A0A0A' }} />
        </div>
        <span className="text-base font-bold tracking-tight" style={{ color: '#F0F0F0' }}>
          Prospectfy
        </span>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-0.5 px-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors relative',
                  isActive
                    ? 'text-[#00D26A]'
                    : 'text-[#888888] hover:text-[#F0F0F0]'
                )}
                style={
                  isActive
                    ? { backgroundColor: '#1A1A1A', borderLeft: '2px solid #00D26A', paddingLeft: '10px' }
                    : { borderLeft: '2px solid transparent', paddingLeft: '10px' }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                  }
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1E1E1E', padding: '12px 8px 8px' }}>
        {/* Plan badge */}
        <div className="px-3 py-2 mb-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: '#1A1A1A', color: '#888888', border: '1px solid #1E1E1E' }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: '#00D26A' }}
            />
            Plano Trial
          </span>
        </div>

        {/* Sign out */}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sm font-medium"
          style={{ color: '#888888' }}
          onClick={handleSignOut}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#F0F0F0'
            ;(e.currentTarget as HTMLElement).style.backgroundColor = '#1A1A1A'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#888888'
            ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
          }}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  )
}
