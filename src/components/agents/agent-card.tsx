'use client'

import Link from 'next/link'
import { Settings, Play, Pause, AlertCircle, Clock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AgentFlowPreview } from './agent-flow-preview'
import type { AgentDefinition } from '@/lib/agents'

type AgentListItem = {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  status: string
  tools: string[]
  channels: string[]
  definition?: unknown
  metrics30d: {
    executions: number
    responses: number
    meetings: number
    failures: number
    avgLatencyMs: number
    costUsd: number
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  prospecting: 'Prospecção',
  qualifying: 'Qualificação',
  enrichment: 'Enriquecimento',
  outreach: 'Outreach',
  follow_up: 'Follow-up',
  customer_success: 'Customer Success',
  analysis: 'Análise',
  whatsapp: 'WhatsApp',
  custom: 'Customizado',
}

const CATEGORY_COLOR: Record<string, string> = {
  prospecting: '#F59E0B',
  qualifying: '#8B5CF6',
  enrichment: '#3B82F6',
  outreach: '#F97316',
  follow_up: '#10B981',
  customer_success: '#A855F7',
  analysis: '#64748B',
  whatsapp: '#10B981',
  custom: '#EF4444',
}

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  active: { label: 'Ativo', color: '#10b981', bg: 'color-mix(in oklab, #10b981 12%, transparent)' },
  draft: { label: 'Rascunho', color: '#f59e0b', bg: 'color-mix(in oklab, #f59e0b 12%, transparent)' },
  paused: { label: 'Pausado', color: '#6b7280', bg: 'color-mix(in oklab, #6b7280 12%, transparent)' },
  archived: { label: 'Arquivado', color: '#6b7280', bg: 'color-mix(in oklab, #6b7280 10%, transparent)' },
}

export function AgentCard({ agent }: { agent: AgentListItem }) {
  const utils = trpc.useUtils()
  const statusMeta = STATUS_META[agent.status] ?? STATUS_META.draft
  const catColor = CATEGORY_COLOR[agent.category] ?? '#64748B'

  const replyRate =
    agent.metrics30d.executions > 0
      ? (agent.metrics30d.responses / agent.metrics30d.executions) * 100
      : 0

  const execute = trpc.agents.execute.useMutation({
    onSuccess: () => {
      toast.success(`Agente "${agent.name}" enfileirado`)
      setTimeout(() => utils.agents.list.invalidate(), 400)
    },
    onError: (e) => toast.error(`Erro ao executar: ${e.message}`),
  })

  const update = trpc.agents.update.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div
      className="group flex h-full flex-col rounded-xl border p-4 transition-all hover:shadow-sm"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface-1)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span
            className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{
              backgroundColor: `color-mix(in oklab, ${catColor} 12%, transparent)`,
              color: catColor,
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            }}
          >
            {CATEGORY_LABEL[agent.category] ?? agent.category}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusMeta.color }}
          />
          {statusMeta.label}
        </span>
      </div>

      {/* Name + description */}
      <div className="mt-3 min-h-[3.75rem]">
        <Link
          href={`/agent/${agent.id}`}
          className="block text-[15px] font-semibold text-[var(--text-primary)] hover:underline"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {agent.name}
        </Link>
        {agent.description && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
            {agent.description}
          </p>
        )}
      </div>

      {/* Metrics row */}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {agent.metrics30d.avgLatencyMs > 0
            ? `${(agent.metrics30d.avgLatencyMs / 1000).toFixed(1)}s/exec`
            : '— s/exec'}
        </span>
        <span>•</span>
        <span>{agent.metrics30d.executions.toLocaleString('pt-BR')} execuções</span>
        {agent.metrics30d.executions > 0 && (
          <>
            <span>•</span>
            <span
              className={cn(
                replyRate >= 10 && 'text-[var(--primary)] font-medium',
                replyRate >= 2 && replyRate < 10 && 'text-[var(--text-secondary)]',
                replyRate < 2 && agent.metrics30d.executions >= 10 && 'text-amber-600'
              )}
            >
              {replyRate.toFixed(1)}% resposta
            </span>
          </>
        )}
      </div>

      {/* Visual flow preview */}
      {Boolean(agent.definition && (agent.definition as AgentDefinition).steps) && (
        <div
          className="mt-3 rounded-lg border px-2 py-2"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--surface-2)',
          }}
        >
          <AgentFlowPreview
            definition={agent.definition as AgentDefinition}
            compact
            maxSteps={5}
          />
        </div>
      )}

      {/* Channel chips */}
      {agent.channels.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {agent.channels.slice(0, 3).map((ch) => (
            <span
              key={ch}
              className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--text-secondary)]"
              style={{ letterSpacing: '0.06em' }}
            >
              {ch}
            </span>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {agent.status === 'active' ? (
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => execute.mutate({ id: agent.id })}
            disabled={execute.isPending}
          >
            <Play className="mr-1 h-3 w-3" />
            Executar
          </Button>
        ) : agent.status === 'draft' || agent.status === 'paused' ? (
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => update.mutate({ id: agent.id, status: 'active' })}
            disabled={update.isPending}
          >
            <Play className="mr-1 h-3 w-3" />
            {agent.status === 'draft' ? 'Ativar' : 'Retomar'}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="flex-1" disabled>
            <AlertCircle className="mr-1 h-3 w-3" />
            Arquivado
          </Button>
        )}

        {agent.status === 'active' && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => update.mutate({ id: agent.id, status: 'paused' })}
            disabled={update.isPending}
            title="Pausar"
          >
            <Pause className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          variant="outline"
          size="icon"
          render={<Link href={`/agent/${agent.id}`} />}
          nativeButton={false}
          title="Configurar"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* IA badge — shown for agents whose definitions were compiled from NL */}
      <div className="mt-2 flex items-center justify-end text-[9px] text-[var(--text-tertiary)]">
        <Sparkles className="mr-1 h-2.5 w-2.5 text-[var(--primary)]" />
        compilado por IA
      </div>
    </div>
  )
}
