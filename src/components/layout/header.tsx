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
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
    </header>
  )
}
