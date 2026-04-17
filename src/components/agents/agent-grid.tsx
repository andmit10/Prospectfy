'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { AgentCard } from './agent-card'
import { AgentCreatorCard } from './agent-creator'
import { AgentFilters, type AgentFilter } from './agent-filters'
import { AgentSuggestionsBanner } from './agent-suggestions-banner'
import { TemplateGallery } from './template-gallery'

/**
 * Main client component for /agent page. Owns filter state + data fetching
 * and stitches the pieces together.
 *
 * Empty state strategy:
 *   - If the org has zero agents (shouldn't happen after migration 010
 *     seeds defaults, but possible if the user deleted everything), we
 *     render the Template Gallery directly so they can clone in one click.
 *   - If the filter matches nothing but there are OTHER agents, we keep a
 *     small "no agents in this filter" hint.
 */
export function AgentGrid() {
  const [filter, setFilter] = useState<AgentFilter>('all')
  const { data: agents, isLoading } = trpc.agents.list.useQuery()

  const counts: Record<string, number> = {}
  for (const a of agents ?? []) {
    counts[a.category as string] = (counts[a.category as string] ?? 0) + 1
  }

  const filtered = (agents ?? []).filter((a) => filter === 'all' || a.category === filter)
  const totalAgents = (agents ?? []).length
  const hasNone = !isLoading && totalAgents === 0

  return (
    <div className="space-y-6">
      <AgentSuggestionsBanner />

      {/* AI creator hero — always visible, promoted to the top so users
          immediately see they can describe an agent in natural language. */}
      <AgentCreatorCard />

      <AgentFilters active={filter} onChange={setFilter} counts={counts} />

      {isLoading ? (
        <div className="rounded-xl border p-6 text-center text-sm text-[var(--text-tertiary)]">
          Carregando agentes...
        </div>
      ) : hasNone ? (
        <div className="space-y-6">
          <div
            className="rounded-xl border p-5"
            style={{
              borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
              backgroundColor: 'color-mix(in oklab, var(--primary) 3%, var(--surface-1))',
            }}
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Comece clonando um template
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Você ainda não tem agentes na sua organização. Clique num dos cards abaixo
              para clonar um template pronto, ou descreva o seu em linguagem natural.
            </p>
          </div>
          <TemplateGallery />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-10 text-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Nenhum agente nesse filtro
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Troque o filtro acima ou crie um agente customizado abaixo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AgentCard
              key={a.id as string}
              agent={{
                id: a.id as string,
                slug: a.slug as string,
                name: a.name as string,
                description: (a.description as string | null) ?? null,
                category: a.category as string,
                status: a.status as string,
                tools: (a.tools as string[]) ?? [],
                channels: (a.channels as string[]) ?? [],
                definition: a.definition as unknown,
                metrics30d: a.metrics30d,
              }}
            />
          ))}
        </div>
      )}

      {/* Template catalog is ALSO shown below the agent list so users
          can clone more at any time — matches the reference UX where the
          bottom of the grid has a "Criar customizado" + templates panel. */}
      {!isLoading && totalAgents > 0 && (
        <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <TemplateGallery />
        </div>
      )}
    </div>
  )
}
