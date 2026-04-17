'use client'

import {
  Zap,
  Brain,
  Wrench,
  BookOpen,
  Clock,
  GitBranch,
  Flag,
  ChevronRight,
} from 'lucide-react'
import type { AgentDefinition, AgentStep } from '@/lib/agents'

/**
 * Horizontal mini-flow preview — shows a compiled agent definition as a
 * row of colored chips connected by arrows. Designed to give the n8n-style
 * "I can see the flow" feeling without the cost of a real canvas.
 *
 * Each chip is color-coded by step type so the user can scan the shape of
 * the agent at a glance.
 */

type StepKind =
  | 'trigger'
  | 'llm_task'
  | 'tool_call'
  | 'retrieve'
  | 'wait'
  | 'conditional'
  | 'end'

const STEP_META: Record<
  StepKind,
  {
    label: string
    color: string
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  }
> = {
  trigger: { label: 'Gatilho', color: '#F59E0B', icon: Zap },
  llm_task: { label: 'IA', color: '#8B5CF6', icon: Brain },
  tool_call: { label: 'Ação', color: '#10B981', icon: Wrench },
  retrieve: { label: 'Buscar', color: '#3B82F6', icon: BookOpen },
  wait: { label: 'Aguardar', color: '#64748B', icon: Clock },
  conditional: { label: 'Se/Então', color: '#F97316', icon: GitBranch },
  end: { label: 'Fim', color: '#EF4444', icon: Flag },
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  lead_created: 'Lead novo',
  pipeline_stage_change: 'Mudou etapa',
  cron: 'Agendado',
  response_received: 'Resposta',
  webhook: 'Webhook',
}

function getStepKind(step: AgentStep): StepKind {
  return step.type as StepKind
}

function getStepLabel(step: AgentStep): string {
  switch (step.type) {
    case 'llm_task':
      return step.task === 'classify'
        ? 'Classificar'
        : step.task === 'extract'
          ? 'Extrair'
          : step.task === 'sequence'
            ? 'Redigir'
            : 'Pensar'
    case 'tool_call':
      return step.tool.replace(/_/g, ' ')
    case 'retrieve':
      return 'Buscar KB'
    case 'wait':
      return `${step.hours}h`
    case 'conditional':
      return 'Condição'
    case 'end':
      return step.outcome ?? 'Fim'
    default:
      return 'Passo'
  }
}

export function AgentFlowPreview({
  definition,
  compact = false,
  maxSteps = 6,
}: {
  definition: AgentDefinition
  compact?: boolean
  maxSteps?: number
}) {
  const steps = definition.steps
  const visible = steps.slice(0, maxSteps)
  const overflow = steps.length - visible.length

  const trigger = STEP_META.trigger

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-1 overflow-x-auto scrollbar-none'
          : 'flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1'
      }
    >
      {/* Trigger chip */}
      <Chip
        label={TRIGGER_LABELS[definition.trigger.type] ?? definition.trigger.type}
        color={trigger.color}
        Icon={trigger.icon}
        compact={compact}
        emphasized
      />

      <Arrow color={trigger.color} />

      {visible.map((step, i) => {
        const kind = getStepKind(step)
        const meta = STEP_META[kind]
        const next = visible[i + 1]
        const nextColor = next
          ? STEP_META[getStepKind(next)].color
          : overflow > 0
            ? 'var(--text-tertiary)'
            : undefined

        return (
          <div key={i} className="flex items-center gap-1.5">
            <Chip
              label={getStepLabel(step)}
              color={meta.color}
              Icon={meta.icon}
              compact={compact}
            />
            {nextColor && <Arrow color={nextColor} />}
          </div>
        )
      })}

      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor: 'var(--surface-2)',
            color: 'var(--text-tertiary)',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

function Chip({
  label,
  color,
  Icon,
  compact,
  emphasized,
}: {
  label: string
  color: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  compact?: boolean
  emphasized?: boolean
}) {
  const size = compact ? 'h-5 px-1.5 text-[9px]' : 'h-6 px-2 text-[10px]'
  const iconSize = compact ? 'h-2.5 w-2.5' : 'h-3 w-3'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${size}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${color} ${emphasized ? 18 : 12}%, transparent)`,
        color,
        border: emphasized
          ? `1px solid color-mix(in oklab, ${color} 35%, transparent)`
          : 'none',
        letterSpacing: '0.02em',
      }}
      title={label}
    >
      <Icon className={iconSize} strokeWidth={2.5} />
      <span className="max-w-[88px] truncate">{label}</span>
    </span>
  )
}

function Arrow({ color }: { color: string }) {
  return (
    <ChevronRight
      className="h-3 w-3 shrink-0"
      strokeWidth={2.5}
      style={{ color: `color-mix(in oklab, ${color} 60%, transparent)` }}
    />
  )
}
