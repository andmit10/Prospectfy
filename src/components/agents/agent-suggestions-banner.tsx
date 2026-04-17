'use client'

import { useState } from 'react'
import { Sparkles, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'

/**
 * Contextual AI suggestions banner — appears at the top of /agent when the
 * nightly worker has produced recommendations for the active org.
 * Each suggestion can be accepted (marked for acceptance) or dismissed.
 */
export function AgentSuggestionsBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const utils = trpc.useUtils()
  const { data: suggestions } = trpc.agents.suggestions.useQuery()

  const act = trpc.agents.actSuggestion.useMutation({
    onSuccess: () => utils.agents.suggestions.invalidate(),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const visible = (suggestions ?? []).filter((s) => !dismissed.has(s.id as string))
  if (visible.length === 0) return null
  const top = visible[0]

  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
        backgroundColor: 'color-mix(in oklab, var(--primary) 5%, var(--surface-1))',
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: 'color-mix(in oklab, var(--primary) 15%, transparent)',
          color: 'var(--primary)',
        }}
      >
        <Sparkles className="h-4 w-4" />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
            Sugestão IA
          </span>
          {visible.length > 1 && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              +{visible.length - 1} outras
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
          {top.title as string}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{top.rationale as string}</p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => act.mutate({ id: top.id as string, action: 'accepted' })}
          disabled={act.isPending}
        >
          <Check className="mr-1 h-3 w-3" />
          Aceitar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setDismissed((prev) => new Set([...prev, top.id as string]))
            act.mutate({ id: top.id as string, action: 'dismissed' })
          }}
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
