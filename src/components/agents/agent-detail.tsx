'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Play,
  Pause,
  Archive,
  Copy,
  Trash2,
  Loader2,
  Clock,
  Zap,
  MessageCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  FileJson,
  List,
  Target,
  Wrench,
  BookOpen,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import { AgentFlowPreview } from './agent-flow-preview'
import type { AgentDefinition } from '@/lib/agents'

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

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  active: { label: 'Ativo', color: '#10b981', bg: 'color-mix(in oklab, #10b981 12%, transparent)' },
  draft: { label: 'Rascunho', color: '#f59e0b', bg: 'color-mix(in oklab, #f59e0b 12%, transparent)' },
  paused: { label: 'Pausado', color: '#6b7280', bg: 'color-mix(in oklab, #6b7280 12%, transparent)' },
  archived: { label: 'Arquivado', color: '#6b7280', bg: 'color-mix(in oklab, #6b7280 10%, transparent)' },
}

type Tab = 'overview' | 'definition' | 'runs' | 'settings'

export function AgentDetail({ agentId }: { agentId: string }) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: agent, isLoading } = trpc.agents.get.useQuery({ id: agentId })
  const { data: runs } = trpc.agents.recentRuns.useQuery(
    { agentId, limit: 20 },
    { enabled: tab === 'runs' }
  )

  const update = trpc.agents.update.useMutation({
    onSuccess: () => {
      toast.success('Agente atualizado')
      utils.agents.get.invalidate({ id: agentId })
      utils.agents.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const execute = trpc.agents.execute.useMutation({
    onSuccess: () => toast.success('Agente enfileirado para execução'),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const duplicate = trpc.agents.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success('Agente duplicado')
      if (data?.id) router.push(`/agent/${data.id}`)
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const del = trpc.agents.delete.useMutation({
    onSuccess: () => {
      toast.success('Agente removido')
      router.push('/agent')
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  if (isLoading || !agent) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando agente...
      </div>
    )
  }

  const statusMeta = STATUS_META[agent.status as string] ?? STATUS_META.draft
  const definition = agent.definition as Record<string, unknown>

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/agent"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Voltar aos agentes
      </Link>

      {/* Header */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                  color: 'var(--primary)',
                }}
              >
                {CATEGORY_LABEL[agent.category as string] ?? agent.category}
              </span>
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
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {agent.name as string}
            </h1>
            {agent.description && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {agent.description as string}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {agent.status === 'active' ? (
              <>
                <Button
                  onClick={() => execute.mutate({ id: agentId })}
                  disabled={execute.isPending}
                >
                  <Play className="mr-1 h-4 w-4" />
                  Executar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => update.mutate({ id: agentId, status: 'paused' })}
                >
                  <Pause className="mr-1 h-4 w-4" />
                  Pausar
                </Button>
              </>
            ) : agent.status === 'draft' || agent.status === 'paused' ? (
              <Button onClick={() => update.mutate({ id: agentId, status: 'active' })}>
                <Play className="mr-1 h-4 w-4" />
                {agent.status === 'draft' ? 'Ativar' : 'Retomar'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          Visão geral
        </TabButton>
        <TabButton active={tab === 'definition'} onClick={() => setTab('definition')}>
          <FileJson className="mr-1 h-3 w-3" />
          Definição
        </TabButton>
        <TabButton active={tab === 'runs'} onClick={() => setTab('runs')}>
          <List className="mr-1 h-3 w-3" />
          Execuções
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          <Settings className="mr-1 h-3 w-3" />
          Configurações
        </TabButton>
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab agent={agent} />}
      {tab === 'definition' && <DefinitionTab definition={definition} agent={agent} />}
      {tab === 'runs' && <RunsTab runs={runs ?? []} />}
      {tab === 'settings' && (
        <SettingsTab
          agent={agent}
          onUpdate={(patch) => update.mutate({ id: agentId, ...patch })}
          onDuplicate={() =>
            duplicate.mutate({ id: agentId, name: `${agent.name as string} (cópia)` })
          }
          onDelete={() => {
            if (confirm(`Tem certeza que deseja remover "${agent.name}"? Esta ação não pode ser desfeita.`)) {
              del.mutate({ id: agentId })
            }
          }}
          pending={update.isPending || duplicate.isPending || del.isPending}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
      style={{
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
      }}
    >
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
          style={{ backgroundColor: 'var(--primary)' }}
        />
      )}
    </button>
  )
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual — você dispara quando quiser',
  lead_created: 'Quando um lead novo entra',
  pipeline_stage_change: 'Quando o lead muda de etapa',
  cron: 'Em horários agendados',
  response_received: 'Quando o lead responder',
  webhook: 'Recebendo webhook externo',
}

function OverviewTab({ agent }: { agent: Record<string, unknown> }) {
  const tools = (agent.tools as string[] | undefined) ?? []
  const channels = (agent.channels as string[] | undefined) ?? []
  const kbIds = (agent.kb_ids as string[] | undefined) ?? []
  const definition = agent.definition as AgentDefinition | undefined
  const stepCount = definition?.steps?.length ?? 0

  const triggerType = (agent.trigger_type as string) ?? 'manual'
  const triggerLabel = TRIGGER_LABELS[triggerType] ?? triggerType
  const cron = agent.cron_expression as string | null | undefined

  return (
    <div className="space-y-5">
      {/* Live flow — the star of the overview */}
      {definition?.steps && definition.steps.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div
              className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '0.08em',
              }}
            >
              Fluxo do agente
            </div>
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {stepCount} {stepCount === 1 ? 'passo' : 'passos'}
            </span>
          </div>
          <AgentFlowPreview definition={definition} maxSteps={10} />
        </div>
      )}

      {/* 3-phase wizard summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <PhaseCard
          step={1}
          icon={Zap}
          color="#F59E0B"
          title="Quando dispara"
          primary={triggerLabel}
          secondary={
            triggerType === 'cron' && cron ? `Agendamento: ${cron}` : undefined
          }
        />
        <PhaseCard
          step={2}
          icon={Target}
          color="#8B5CF6"
          title="O que o agente faz"
          primary={(definition?.goal as string | undefined) ?? '—'}
          secondary={
            stepCount > 0
              ? `${stepCount} ${stepCount === 1 ? 'passo na execução' : 'passos na execução'}`
              : undefined
          }
        />
        <PhaseCard
          step={3}
          icon={Wrench}
          color="#10B981"
          title="Com o que ele trabalha"
          primary={
            [
              tools.length > 0 ? `${tools.length} ação(ões)` : null,
              channels.length > 0 ? `${channels.length} canal(is)` : null,
              kbIds.length > 0 ? `${kbIds.length} KB(s)` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'
          }
          chips={[
            ...tools.map((t) => ({ label: t.replace(/_/g, ' '), color: '#10B981', Icon: Wrench })),
            ...channels.map((c) => ({ label: c, color: '#3B82F6', Icon: MessageSquare })),
            ...(kbIds.length > 0
              ? [{ label: `${kbIds.length} KB`, color: '#A855F7', Icon: BookOpen }]
              : []),
          ]}
        />
      </div>
    </div>
  )
}

function PhaseCard({
  step,
  icon: Icon,
  color,
  title,
  primary,
  secondary,
  chips,
}: {
  step: number
  icon: LucideIcon
  color: string
  title: string
  primary: string
  secondary?: string
  chips?: Array<{ label: string; color: string; Icon: LucideIcon }>
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
          }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <span
          className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.08em',
          }}
        >
          Etapa {step}
        </span>
      </div>
      <p
        className="text-[13px] font-semibold text-[var(--text-primary)]"
        style={{
          fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{primary}</p>
      {secondary && (
        <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{secondary}</p>
      )}
      {chips && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.slice(0, 5).map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: `color-mix(in oklab, ${c.color} 12%, transparent)`,
                color: c.color,
              }}
            >
              <c.Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
              {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function DefinitionTab({
  definition,
  agent,
}: {
  definition: Record<string, unknown>
  agent: Record<string, unknown>
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Objetivo
        </p>
        <p className="mt-1 text-sm text-[var(--text-primary)]">
          {(definition.goal as string) ?? '—'}
        </p>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Passos da execução
        </p>
        <ol className="space-y-2">
          {((definition.steps as unknown[] | undefined) ?? []).map((step, i) => {
            const s = step as Record<string, unknown>
            return (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg p-2"
                style={{ backgroundColor: 'var(--surface-2)' }}
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs font-semibold">
                    {s.type as string}
                    {s.task ? ` · ${s.task}` : ''}
                    {s.tool ? ` · ${s.tool}` : ''}
                  </p>
                  {s.user ? (
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      {(s.user as string).slice(0, 140)}...
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <details
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">
          Ver JSON completo (debug)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[var(--surface-2)] p-3 text-[11px] font-mono">
          {JSON.stringify(definition, null, 2)}
        </pre>
      </details>

      {agent.system_prompt ? (
        <details
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
        >
          <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">
            System prompt compilado
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[var(--surface-2)] p-3 text-[11px] whitespace-pre-wrap">
            {agent.system_prompt as string}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

function RunsTab({
  runs,
}: {
  runs: Array<Record<string, unknown>>
}) {
  if (runs.length === 0) {
    return (
      <div
        className="rounded-xl border-2 border-dashed p-10 text-center"
        style={{ borderColor: 'var(--border)' }}
      >
        <Clock className="mx-auto h-6 w-6 text-[var(--text-tertiary)]" />
        <p className="mt-2 text-sm font-semibold">Nenhuma execução ainda</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Clique em &ldquo;Executar&rdquo; no topo pra rodar este agente pela primeira vez.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const status = r.status as string
        const Icon =
          status === 'success'
            ? CheckCircle2
            : status === 'failed'
              ? XCircle
              : status === 'running'
                ? Loader2
                : AlertTriangle
        const color =
          status === 'success'
            ? '#10b981'
            : status === 'failed'
              ? '#ef4444'
              : status === 'running'
                ? 'var(--primary)'
                : '#f59e0b'
        return (
          <div
            key={r.id as string}
            className="flex items-center gap-3 rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${status === 'running' ? 'animate-spin' : ''}`}
              style={{ color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-semibold" style={{ color }}>
                  {status}
                </span>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="text-[var(--text-secondary)]">{r.trigger as string}</span>
                {r.outcome ? (
                  <>
                    <span className="text-[var(--text-tertiary)]">·</span>
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold">
                      {r.outcome as string}
                    </span>
                  </>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                {new Date(r.started_at as string).toLocaleString('pt-BR')}
                {r.latency_ms ? ` · ${((r.latency_ms as number) / 1000).toFixed(1)}s` : ''}
                {r.tokens_used ? ` · ${r.tokens_used} tokens` : ''}
                {r.cost_usd && Number(r.cost_usd) > 0 ? ` · $${Number(r.cost_usd).toFixed(4)}` : ''}
              </p>
              {r.error ? (
                <p className="mt-1 text-[11px] text-[var(--danger)]">{r.error as string}</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SettingsTab({
  agent,
  onUpdate,
  onDuplicate,
  onDelete,
  pending,
}: {
  agent: Record<string, unknown>
  onUpdate: (patch: {
    name?: string
    description?: string | null
    status?: 'draft' | 'active' | 'paused' | 'archived'
  }) => void
  onDuplicate: () => void
  onDelete: () => void
  pending: boolean
}) {
  return (
    <div className="space-y-4">
      <EditableCard
        key={`name:${agent.name as string}`}
        initialName={(agent.name as string) ?? ''}
        initialDescription={(agent.description as string | null) ?? ''}
        onSave={(name, description) => onUpdate({ name, description: description || null })}
        pending={pending}
      />

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <p className="mb-3 text-sm font-semibold">Ações</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onDuplicate} disabled={pending}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            Duplicar
          </Button>
          <Button
            variant="outline"
            onClick={() => onUpdate({ status: 'archived' })}
            disabled={pending || agent.status === 'archived'}
          >
            <Archive className="mr-1 h-3.5 w-3.5" />
            Arquivar
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={pending}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Excluir permanentemente
          </Button>
        </div>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <p className="mb-2 text-sm font-semibold">Metadata</p>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-[var(--text-tertiary)]">ID</dt>
          <dd className="font-mono">{agent.id as string}</dd>
          <dt className="text-[var(--text-tertiary)]">Slug</dt>
          <dd className="font-mono">{agent.slug as string}</dd>
          <dt className="text-[var(--text-tertiary)]">Criado em</dt>
          <dd>{new Date(agent.created_at as string).toLocaleString('pt-BR')}</dd>
          <dt className="text-[var(--text-tertiary)]">Última atualização</dt>
          <dd>{new Date(agent.updated_at as string).toLocaleString('pt-BR')}</dd>
          {agent.created_from_template ? (
            <>
              <dt className="text-[var(--text-tertiary)]">Template</dt>
              <dd className="font-mono">{agent.created_from_template as string}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  )
}

function EditableCard({
  initialName,
  initialDescription,
  onSave,
  pending,
}: {
  initialName: string
  initialDescription: string
  onSave: (name: string, description: string) => void
  pending: boolean
}) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const dirty = name !== initialName || description !== initialDescription

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <p className="text-sm font-semibold">Informações básicas</p>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
          Nome
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
          Descrição
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--surface-1)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
      <div className="flex justify-end">
        <Button
          onClick={() => onSave(name, description)}
          disabled={!dirty || name.length < 2 || pending}
        >
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}

// Suppress unused icon warnings — used dynamically via status conditions above.
void Zap
void MessageCircle
