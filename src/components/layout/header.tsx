import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Kbd } from '@/components/ui/kbd'
import { Search, Bell } from 'lucide-react'

interface HeaderProps {
  title: string
}

export async function Header({ title }: HeaderProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const initials =
    (user?.user_metadata?.full_name as string | undefined)
      ?.split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    'U'

  return (
    <header
      className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--background)]/80 px-6 backdrop-blur-xl"
    >
      <h1
        className="text-[15px] font-semibold text-[var(--text-primary)]"
        style={{
          fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h1>

      <div className="flex items-center gap-2">
        {/* Search stub — placeholder for Cmd+K palette */}
        <button
          type="button"
          className="group hidden md:inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-tertiary)] transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="min-w-[140px] text-left">Buscar...</span>
          <Kbd>⌘K</Kbd>
        </button>

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notificações"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
        >
          <Bell className="h-3.5 w-3.5" />
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--primary)]"
          />
        </button>

        {/* Avatar */}
        <Avatar className="h-8 w-8">
          <AvatarFallback
            className="text-xs font-semibold bg-[var(--surface-3)] text-[var(--primary)] border border-[var(--border)]"
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
