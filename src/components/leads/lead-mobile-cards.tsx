'use client'

import Link from 'next/link'
import type { Lead, PipelineStatus } from '@/types'
import { PipelineBadge } from './pipeline-badge'
import { ScoreBadge } from './lead-visuals'
import { Mail, Link2, ChevronRight, MessageSquare } from 'lucide-react'

type Props = {
  leads: Lead[]
  isLoading: boolean
  pipelineIdMap: Record<string, { nome: string; color: string | null }>
}

/**
 * Card-based list of leads for viewports below `md` (<768px). The full
 * react-table UI (sort, filters, bulk actions) is hidden on mobile because
 * it doesn't fit; we still keep the search input above the cards in
 * leads-table.tsx for basic discovery.
 */
export function LeadMobileCards({ leads, isLoading, pipelineIdMap }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2 md:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface-1)]"
          />
        ))}
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div
        className="md:hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-1)] p-6 text-center text-sm text-[var(--text-tertiary)]"
      >
        Nenhum lead por aqui ainda. Importe um CSV ou gere leads com a IA.
      </div>
    )
  }

  return (
    <ul className="md:hidden space-y-2">
      {leads.map((lead) => {
        const pipeline = lead.pipeline_id ? pipelineIdMap[lead.pipeline_id] : null
        return (
          <li
            key={lead.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:bg-[var(--surface-2)]"
          >
            <Link
              href={`/leads/${lead.id}`}
              className="flex items-start gap-3"
              aria-label={`Abrir ${lead.decisor_nome}`}
            >
              <ScoreBadge score={lead.lead_score} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {lead.decisor_nome}
                  </p>
                  <PipelineBadge status={lead.status_pipeline as PipelineStatus} />
                </div>
                <p className="truncate text-xs text-[var(--text-tertiary)]">
                  {[lead.decisor_cargo, lead.empresa_nome].filter(Boolean).join(' · ')}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                  {pipeline && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${pipeline.color ?? 'var(--primary)'} 12%, transparent)`,
                        color: pipeline.color ?? 'var(--primary)',
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: pipeline.color ?? 'var(--primary)' }}
                      />
                      {pipeline.nome}
                    </span>
                  )}
                  {lead.whatsapp && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" style={{ color: '#25D366' }} />
                      {lead.whatsapp}
                    </span>
                  )}
                  {lead.email && (
                    <Mail className="h-3 w-3" style={{ color: 'var(--primary)' }} aria-label="Tem e-mail" />
                  )}
                  {lead.linkedin_url && (
                    <Link2 className="h-3 w-3" style={{ color: '#0A66C2' }} aria-label="Tem LinkedIn" />
                  )}
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 mt-1"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
