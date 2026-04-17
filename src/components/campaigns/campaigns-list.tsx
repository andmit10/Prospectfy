'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Plus,
  Users,
  Send,
  MessageSquare,
  CalendarCheck,
  Sparkles,
  Loader2,
  ArrowRight,
  X,
  Zap,
  RefreshCw,
  Handshake,
  Target,
  FileText,
  BookOpen,
  Clock,
  Mail,
  Briefcase,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'
import type { CampaignStatus } from '@/types'

// --- Icon resolvers --------------------------------------------------------

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Zap,
  RefreshCw,
  Handshake,
  Target,
  FileText,
  BookOpen,
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  email: Mail,
  linkedin: Briefcase,
  landing_page: FileText,
}

// --- Shared bits -----------------------------------------------------------

function MetricChip({
  icon: Icon,
  color,
  value,
  label,
}: {
  icon: LucideIcon
  color: string
  value: number
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
          color,
        }}
      >
        <Icon className="h-3 w-3" strokeWidth={2.25} />
      </span>
      <span className="text-xs text-[var(--text-secondary)]">
        <strong className="font-semibold text-[var(--text-primary)]">{value}</strong> {label}
      </span>
    </div>
  )
}

const statusLabel: Record<CampaignStatus, string> = {
  rascunho:  'Rascunho',
  ativa:     'Ativa',
  pausada:   'Pausada',
  concluida: 'Concluída',
}

const statusColor: Record<CampaignStatus, string> = {
  rascunho:  '#64748B',
  ativa:     '#10B981',
  pausada:   '#F59E0B',
  concluida: '#3B82F6',
}

const METRIC_COLORS = {
  leads:     '#10B981',
  enviados:  '#3B82F6',
  respostas: '#A855F7',
  reunioes:  '#F97316',
}

const AI_EXAMPLES = [
  'Reaquecer clientes inativos há 30+ dias com 3 mensagens leves',
  'Prospecção fria para clínicas de estética, 5 toques WhatsApp',
  'Follow-up pós-proposta com urgência elegante em 4 dias',
  'Pesquisa NPS simples para clientes ativos há 90+ dias',
]

// --- AI box ---------------------------------------------------------------

function AICampaignCreator() {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<{
    nome: string
    descricao: string
    steps: Array<{
      step_order: number
      canal: 'whatsapp' | 'email' | 'linkedin'
      delay_hours: number
      tipo_mensagem?: 'texto' | 'imagem' | 'documento' | 'audio'
      mensagem_template: string
    }>
  } | null>(null)

  const utils = trpc.useUtils()

  const compile = trpc.campaigns.compileFromDescription.useMutation({
    onSuccess: (data) => {
      setDraft(data.draft)
      toast.success(`Rascunho gerado (${data.modelId})`)
    },
    onError: (e) => toast.error(`Erro ao gerar: ${e.message}`),
  })

  const create = trpc.campaigns.create.useMutation({
    onSuccess: (c) => {
      toast.success('Campanha criada como rascunho')
      utils.campaigns.list.invalidate()
      router.push(`/campaigns/${c.id}`)
    },
    onError: (e) => toast.error(`Erro ao criar: ${e.message}`),
  })

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group flex w-full items-center justify-between gap-4 rounded-xl border-2 border-dashed p-5 text-left transition-all hover:shadow-md"
        style={{
          borderColor: 'color-mix(in oklab, #F59E0B 35%, var(--border))',
          backgroundColor: 'color-mix(in oklab, #F59E0B 4%, var(--surface-1))',
        }}
      >
        <div className="flex items-center gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.05]"
            style={{
              backgroundColor: 'color-mix(in oklab, #F59E0B 16%, transparent)',
              color: '#F59E0B',
            }}
          >
            <Sparkles className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div>
            <div
              className="text-[15px] font-semibold text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '-0.01em',
              }}
            >
              Criar campanha com IA
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Descreva o que você quer — a IA monta a cadência completa pra você
            </div>
          </div>
        </div>
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase sm:inline-flex"
          style={{
            backgroundColor: '#F59E0B',
            color: '#fff',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.5} />
          Começar
        </span>
      </button>
    )
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: 'color-mix(in oklab, #F59E0B 50%, var(--border))',
        backgroundColor: 'color-mix(in oklab, #F59E0B 4%, var(--surface-1))',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: '#F59E0B' }} />
          <h3
            className="text-sm font-semibold text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            Criar campanha com IA
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setExpanded(false)
            setDescription('')
            setDraft(null)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!draft ? (
        <>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Descreva o objetivo, público e canal. A IA vai gerar nome, descrição e uma cadência
            pronta pra revisar.
          </p>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Quero reaquecer clientes que sumiram há 30+ dias com 3 mensagens leves no WhatsApp"
            rows={4}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface-1)',
              color: 'var(--text-primary)',
            }}
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderColor: 'var(--border)' }}
              >
                {ex.length > 55 ? `${ex.slice(0, 52)}...` : ex}
              </button>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              onClick={() => compile.mutate({ description })}
              disabled={description.length < 10 || compile.isPending}
            >
              {compile.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Gerando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" />
                  Gerar cadência
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            Revise o rascunho. Pode criar como rascunho e editar os textos depois.
          </p>

          <div
            className="mb-3 rounded-lg border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
          >
            <div
              className="text-[15px] font-semibold text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '-0.01em',
              }}
            >
              {draft.nome}
            </div>
            <div className="mt-1 text-xs text-[var(--text-secondary)]">{draft.descricao}</div>
          </div>

          <FlowPreview
            steps={draft.steps.map((s) => ({
              canal: s.canal,
              delay_hours: s.delay_hours,
            }))}
          />

          <div className="mt-3 space-y-2">
            {draft.steps.map((s) => {
              const Icon = CHANNEL_ICONS[s.canal] ?? MessageCircle
              return (
                <div
                  key={s.step_order}
                  className="rounded-lg border p-2.5"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">
                    <Icon className="h-3 w-3" />
                    <span>
                      {s.canal} · {s.delay_hours === 0 ? 'imediato' : `+${s.delay_hours}h`}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-[var(--text-primary)]">
                    {s.mensagem_template}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Voltar
            </Button>
            <Button
              onClick={() =>
                create.mutate({
                  nome: draft.nome,
                  descricao: draft.descricao,
                  steps: draft.steps.map((s) => ({
                    step_order: s.step_order,
                    canal: s.canal,
                    delay_hours: s.delay_hours,
                    tipo_mensagem: s.tipo_mensagem ?? 'texto',
                    mensagem_template: s.mensagem_template,
                    ativo: true,
                  })),
                })
              }
              disabled={create.isPending}
            >
              {create.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  Criar como rascunho
                  <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// --- Horizontal flow preview (channel chips + delays) ---------------------

function FlowPreview({
  steps,
}: {
  steps: Array<{ canal: string; delay_hours: number }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const Icon = CHANNEL_ICONS[s.canal] ?? MessageCircle
        const color =
          s.canal === 'whatsapp'
            ? '#25D366'
            : s.canal === 'email'
              ? '#3B82F6'
              : s.canal === 'linkedin'
                ? '#0A66C2'
                : '#64748B'
        return (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-[var(--text-tertiary)]"
                title={`${s.delay_hours}h depois`}
              >
                <Clock className="h-2.5 w-2.5" />
                {s.delay_hours}h
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                color,
              }}
            >
              <Icon className="h-3 w-3" strokeWidth={2.25} />
              {i + 1}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// --- Template card --------------------------------------------------------

type TemplateMeta = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  color: string
  useCase: string
  expectedResult: string
  tags: string[]
  stepCount: number
  channels: string[]
}

function TemplateCard({
  template,
  onOpen,
}: {
  template: TemplateMeta
  onOpen: () => void
}) {
  const Icon = TEMPLATE_ICONS[template.icon] ?? Zap
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col items-start gap-3 rounded-xl border bg-[var(--surface-1)] p-4 text-left transition-all hover:shadow-md"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.05]"
          style={{
            backgroundColor: `color-mix(in oklab, ${template.color} 14%, transparent)`,
            color: template.color,
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
          style={{
            backgroundColor: `color-mix(in oklab, ${template.color} 10%, transparent)`,
            color: template.color,
            letterSpacing: '0.08em',
          }}
        >
          {template.category.replace('_', ' ')}
        </span>
      </div>

      <div
        className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]"
        style={{
          fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          letterSpacing: '-0.01em',
        }}
      >
        {template.name}
      </div>

      <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
        {template.description}
      </p>

      <div className="mt-auto flex w-full items-center justify-between pt-2">
        <div className="flex items-center gap-1">
          {template.channels.map((c) => {
            const ChIcon = CHANNEL_ICONS[c] ?? MessageCircle
            return (
              <span
                key={c}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--text-secondary)]"
              >
                <ChIcon className="h-3 w-3" strokeWidth={2.25} />
              </span>
            )
          })}
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">
          {template.stepCount} {template.stepCount === 1 ? 'toque' : 'toques'}
        </span>
      </div>
    </button>
  )
}

// --- Template preview modal ----------------------------------------------

function TemplatePreviewDialog({
  templateId,
  onClose,
}: {
  templateId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: tpl, isLoading } = trpc.campaigns.getTemplate.useQuery(
    { id: templateId ?? '' },
    { enabled: !!templateId }
  )

  const createFromTemplate = trpc.campaigns.createFromTemplate.useMutation({
    onSuccess: (c) => {
      toast.success('Campanha criada como rascunho')
      utils.campaigns.list.invalidate()
      onClose()
      router.push(`/campaigns/${c.id}`)
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const Icon = tpl ? (TEMPLATE_ICONS[tpl.icon] ?? Zap) : Zap

  return (
    <Dialog open={!!templateId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {isLoading || !tpl ? (
          <div className="space-y-3 py-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${tpl.color} 14%, transparent)`,
                    color: tpl.color,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <DialogTitle
                    style={{
                      fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {tpl.name}
                  </DialogTitle>
                  <DialogDescription className="mt-1">{tpl.description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
              <div>
                <div className="font-semibold text-[var(--text-secondary)]">Quando usar</div>
                <div className="mt-0.5 text-[var(--text-primary)]">{tpl.useCase}</div>
              </div>
              <div>
                <div className="font-semibold text-[var(--text-secondary)]">Resultado esperado</div>
                <div className="mt-0.5 text-[var(--text-primary)]">{tpl.expectedResult}</div>
              </div>
            </div>

            <div>
              <div
                className="mb-2 text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
                style={{
                  fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  letterSpacing: '0.08em',
                }}
              >
                Fluxo da cadência
              </div>
              <FlowPreview
                steps={tpl.steps.map((s) => ({ canal: s.canal, delay_hours: s.delay_hours }))}
              />
            </div>

            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {tpl.steps.map((s) => {
                const ChIcon = CHANNEL_ICONS[s.canal] ?? MessageCircle
                return (
                  <div
                    key={s.step_order}
                    className="rounded-lg border p-3"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md"
                        style={{ color: tpl.color }}
                      >
                        <ChIcon className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                      Passo {s.step_order} · {s.canal} ·{' '}
                      {s.delay_hours === 0 ? 'imediato' : `+${s.delay_hours}h`}
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-[var(--text-primary)]">
                      {s.mensagem_template}
                    </p>
                    {s.note && (
                      <p className="mt-2 rounded border-l-2 bg-[var(--surface-1)] p-2 text-[10px] italic text-[var(--text-tertiary)]"
                        style={{ borderColor: tpl.color }}>
                        💡 {s.note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={() => createFromTemplate.mutate({ templateId: tpl.id })}
                disabled={createFromTemplate.isPending}
              >
                {createFromTemplate.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    Usar este modelo
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Main component -------------------------------------------------------

export function CampaignsList() {
  const { data: campaigns, isLoading } = trpc.campaigns.list.useQuery()
  const { data: templates } = trpc.campaigns.listTemplates.useQuery()
  const [previewId, setPreviewId] = useState<string | null>(null)

  const hasCampaigns = !!campaigns && campaigns.length > 0

  return (
    <div className="space-y-6">
      {/* Top actions row — only when list has items */}
      {hasCampaigns && (
        <div className="flex justify-end">
          <Button nativeButton={false} render={<Link href="/campaigns/new" />}>
            <Plus className="mr-1 h-4 w-4" /> Nova campanha em branco
          </Button>
        </div>
      )}

      {/* Existing campaigns */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : hasCampaigns ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns!.map((c) => {
            const sColor = statusColor[c.status as CampaignStatus]
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle
                      className="text-[15px]"
                      style={{
                        fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {c.nome}
                    </CardTitle>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${sColor} 12%, transparent)`,
                        color: sColor,
                        letterSpacing: '0.06em',
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sColor }} />
                      {statusLabel[c.status as CampaignStatus]}
                    </span>
                  </CardHeader>
                  <CardContent>
                    {c.descricao && (
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                        {c.descricao}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <MetricChip icon={Users} color={METRIC_COLORS.leads} value={c.total_leads} label="leads" />
                      <MetricChip icon={Send} color={METRIC_COLORS.enviados} value={c.total_enviados} label="enviados" />
                      <MetricChip icon={MessageSquare} color={METRIC_COLORS.respostas} value={c.total_respondidos} label="respostas" />
                      <MetricChip icon={CalendarCheck} color={METRIC_COLORS.reunioes} value={c.total_reunioes} label="reuniões" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : null}

      {/* AI creator — always visible, big when empty */}
      <AICampaignCreator />

      {/* Template gallery */}
      {templates && templates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2
                className="text-[17px] font-semibold text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  letterSpacing: '-0.02em',
                }}
              >
                Modelos prontos
              </h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Cadências completas que você pode usar como ponto de partida
              </p>
            </div>
            {!hasCampaigns && (
              <Link
                href="/campaigns/new"
                className="text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Prefiro começar em branco →
              </Link>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} onOpen={() => setPreviewId(t.id)} />
            ))}
          </div>
        </div>
      )}

      <TemplatePreviewDialog templateId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  )
}
