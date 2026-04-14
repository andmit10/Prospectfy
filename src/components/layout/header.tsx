import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface HeaderProps {
  title: string
}

export async function Header({ title }: HeaderProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <header
      className="flex h-14 items-center justify-between px-6"
      style={{
        backgroundColor: '#0A0A0A',
        borderBottom: '1px solid #1E1E1E',
      }}
    >
      <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#F0F0F0' }}>
        {title}
      </h1>
      <Avatar className="h-8 w-8">
        <AvatarFallback
          className="text-xs font-semibold"
          style={{ backgroundColor: '#1A1A1A', color: '#00D26A', border: '1px solid #1E1E1E' }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
    </header>
  )
}
