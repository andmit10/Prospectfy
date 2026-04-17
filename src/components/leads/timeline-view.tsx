'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Interaction, InteracaoTipo } from '@/types'

const interacaoLabel: Record<InteracaoTipo, string> = {
  enviado: 'Mensagem enviada',
  entregue: 'Entregue',
  lido: 'Lido',
  respondido: 'Lead respondeu',
  clicado: 'Clicou no link',
  bounce: 'Bounce',
  erro: 'Erro no envio',
}

const interacaoColor: Record<InteracaoTipo, string> = {
  enviado: '#3B82F6',
  entregue: '#64748B',
  lido: '#A855F7',
  respondido: '#10B981',
  clicado: '#F59E0B',
  bounce: '#EF4444',
  erro: '#EF4444',
}

type Props = {
  leadId: string
  initialInteractions: Interaction[]
}

export function TimelineView({ leadId, initialInteractions }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>(
    // Sort ascending so newest appears at the bottom — matches the vertical timeline reading flow.
    [...initialInteractions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  )
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`interactions:lead:${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'interactions',
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const next = payload.new as Interaction
          setInteractions((prev) => {
            if (prev.some((i) => i.id === next.id)) return prev
            return [...prev, next].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          })
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle
          className="text-[15px] font-semibold"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          Timeline de interações
        </CardTitle>
        <LiveIndicator live={isLive} />
      </CardHeader>
      <CardContent>
        {interactions.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Nenhuma interação ainda.</p>
        ) : (
          <ol className="relative border-l border-[var(--border)] ml-3 space-y-4">
            {interactions.map((it) => (
              <TimelineItem key={it.id} interaction={it} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function LiveIndicator({ live }: { live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase"
      style={{
        color: live ? '#10B981' : 'var(--text-tertiary)',
        letterSpacing: '0.06em',
      }}
      aria-live="polite"
      title={live ? 'Atualizando em tempo real' : 'Modo estático'}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: live ? '#10B981' : 'var(--text-tertiary)',
          boxShadow: live ? '0 0 0 3px color-mix(in oklab, #10B981 25%, transparent)' : 'none',
        }}
      />
      {live ? 'Ao vivo' : 'Offline'}
    </span>
  )
}

function TimelineItem({ interaction: it }: { interaction: Interaction }) {
  const c = interacaoColor[it.tipo]
  return (
    <li className="ml-4">
      <div
        className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-[var(--background)]"
        style={{ backgroundColor: c }}
      />
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{
            backgroundColor: `color-mix(in oklab, ${c} 12%, transparent)`,
            color: c,
            letterSpacing: '0.05em',
          }}
        >
          {interacaoLabel[it.tipo]}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {new Date(it.created_at).toLocaleString('pt-BR')}
        </span>
      </div>
      {it.mensagem_enviada && (
        <p className="text-sm bg-[var(--surface-2)] rounded p-2 mt-1 text-[var(--text-primary)]">
          {it.mensagem_enviada}
        </p>
      )}
      {it.resposta_lead && (
        <p
          className="text-sm rounded p-2 mt-1"
          style={{
            backgroundColor: 'color-mix(in oklab, #10B981 10%, transparent)',
            color: 'var(--text-primary)',
            border: '1px solid color-mix(in oklab, #10B981 25%, transparent)',
          }}
        >
          <strong style={{ color: '#10B981' }}>Resposta:</strong> {it.resposta_lead}
        </p>
      )}
    </li>
  )
}
