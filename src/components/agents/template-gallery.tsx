'use client'

import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import {
  Sparkles,
  Copy,
  Loader2,
  BarChart3,
  Bot,
  Megaphone,
  Search,
  UserSearch,
  MessageCircle,
  Zap,
} from 'lucide-react'
import { AgentFlowPreview } from './agent-flow-preview'
import type { AgentDefinition } from '@/lib/agents'

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  UserSearch,
  BarChart3,
  Megaphone,
  Bot,
  Search,
  MessageCircle,
  Zap,
  Sparkles,
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

export function TemplateGallery() {
  const utils = trpc.useUtils()
  const { data: templates, isLoading } = trpc.agents.templates.useQuery()

  const create = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast.success('Agente clonado. Ative na lista acima.')
      utils.agents.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
        Carregando templates...
      </p>
    )
  }

  if (!templates || templates.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            backgroundColor: 'color-mix(in oklab, #F59E0B 14%, transparent)',
            color: '#F59E0B',
          }}
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <h3
          className="text-[15px] font-semibold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          Templates prontos
        </h3>
        <span className="text-[11px] text-[var(--text-tertiary)]">
          Clique para clonar na sua organização
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const Icon = ICONS[t.icon_name ?? ''] ?? Sparkles
          const catColor = CATEGORY_COLOR[t.category as string] ?? '#64748B'
          const def = t.definition as unknown as AgentDefinition
          return (
            <button
              key={t.id as string}
              type="button"
              onClick={() => {
                create.mutate({
                  name: t.name as string,
                  description: (t.description as string) ?? '',
                  category: t.category as
                    | 'prospecting'
                    | 'qualifying'
                    | 'enrichment'
                    | 'outreach'
                    | 'follow_up'
                    | 'customer_success'
                    | 'analysis'
                    | 'whatsapp'
                    | 'custom',
                  status: 'draft',
                  definition: t.definition as Record<string, unknown>,
                  fromTemplate: t.id as string,
                })
              }}
              disabled={create.isPending}
              className="group text-left rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface-1)',
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.05]"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${catColor} 14%, transparent)`,
                    color: catColor,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${catColor} 12%, transparent)`,
                    color: catColor,
                    letterSpacing: '0.08em',
                    fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  }}
                >
                  {CATEGORY_LABEL[t.category as string] ?? t.category}
                </span>
              </div>

              <h4
                className="text-[15px] font-semibold text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  letterSpacing: '-0.01em',
                }}
              >
                {t.name as string}
              </h4>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)] min-h-[2.25rem]">
                {t.description as string}
              </p>

              {/* Visual flow preview — shows the shape of the agent at a glance */}
              {def?.steps && (
                <div
                  className="mt-3 rounded-lg border px-2 py-2"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface-2)',
                  }}
                >
                  <AgentFlowPreview definition={def} compact maxSteps={5} />
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  {def?.steps && (
                    <span className="font-semibold">{def.steps.length} passos</span>
                  )}
                  {def?.channels && def.channels.length > 0 && (
                    <>
                      <span>•</span>
                      <span>{def.channels.join(', ')}</span>
                    </>
                  )}
                </div>

                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: catColor }}
                >
                  {create.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Clonando...
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" strokeWidth={2.5} />
                      Clonar
                    </>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
