'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ReplyPayload = {
  id: string
  decisor_nome: string | null
  empresa_nome: string | null
  status_pipeline: string | null
  updated_at: string | null
}

/**
 * Subscribes to Supabase Realtime for leads flipping to `status_pipeline='respondeu'`
 * and surfaces the event as both a toast and an unread counter in the header
 * bell. RLS already scopes visible rows to the current user's org, so no
 * additional client-side filtering is required.
 */
export function NotificationBell() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('leads:replied')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
          filter: 'status_pipeline=eq.respondeu',
        },
        (payload) => {
          const lead = payload.new as ReplyPayload
          if (!lead?.id || seenIds.current.has(lead.id)) return
          seenIds.current.add(lead.id)
          setUnread((n) => n + 1)

          const who = lead.decisor_nome ?? 'Lead'
          const empresa = lead.empresa_nome ? ` (${lead.empresa_nome})` : ''
          toast.success(`${who}${empresa} respondeu`, {
            description: 'Clique para abrir',
            action: {
              label: 'Abrir',
              onClick: () => router.push(`/leads/${lead.id}`),
            },
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return (
    <button
      type="button"
      aria-label={unread > 0 ? `${unread} respostas novas` : 'Notificações'}
      onClick={() => {
        setUnread(0)
        router.push('/leads?status=respondeu')
      }}
      className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
    >
      <Bell className="h-3.5 w-3.5" />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-white"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]"
        />
      )}
    </button>
  )
}
