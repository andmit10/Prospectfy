'use client'

import { trpc } from '@/lib/trpc-client'
import { PipelineBadge } from './pipeline-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageSquare,
  Mail,
  Phone,
  Building2,
  User,
  MapPin,
  Star,
  ExternalLink,
  Globe,
  FileText,
  Users as UsersIcon,
  Calendar,
  Hash,
  Landmark,
  Briefcase,
  DollarSign,
  Building,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { getMeta } from './lead-visuals'
import type { Interaction, InteracaoTipo } from '@/types'

const interacaoLabel: Record<InteracaoTipo, string> = {
  enviado:   'Mensagem enviada',
  entregue:  'Entregue',
  lido:      'Lido',
  respondido:'Lead respondeu',
  clicado:   'Clicou no link',
  bounce:    'Bounce',
  erro:      'Erro no envio',
}

const interacaoColor: Record<InteracaoTipo, string> = {
  enviado:   '#3B82F6',
  entregue:  '#64748B',
  lido:      '#A855F7',
  respondido:'#10B981',
  clicado:   '#F59E0B',
  bounce:    '#EF4444',
  erro:      '#EF4444',
}

function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        Nenhuma interação ainda.
      </p>
    )
  }

  return (
    <ol className="relative border-l border-[var(--border)] ml-3 space-y-4">
      {interactions.map((it) => {
        const c = interacaoColor[it.tipo]
        return (
          <li key={it.id} className="ml-4">
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
      })}
    </ol>
  )
}

/**
 * Colored field row — icon chip + label + value. Consistent pattern
 * across all lead data points.
 */
function Field({
  icon: Icon,
  color,
  label,
  value,
  href,
  mono,
  copyable,
}: {
  icon: LucideIcon
  color: string
  label: string
  value: React.ReactNode
  href?: string | null
  mono?: boolean
  copyable?: boolean
}) {
  const displayValue = value === null || value === undefined || value === '' ? (
    <span className="text-[var(--text-tertiary)] italic text-xs">não informado</span>
  ) : (
    value
  )

  const content = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
          color,
        }}
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </p>
        <p
          className={`text-[14px] font-semibold text-[var(--text-primary)] truncate ${mono ? 'font-mono' : ''}`}
          style={!mono ? {
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          } : undefined}
          title={copyable && typeof value === 'string' ? value : undefined}
        >
          {displayValue}
        </p>
      </div>
    </>
  )

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 flex-1 min-w-0">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  )
}

function formatBrl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-BR')
  } catch {
    return d
  }
}

export function LeadDetail({ id }: { id: string }) {
  const { data: lead, isLoading } = trpc.leads.getById.useQuery(id)

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!lead) {
    return <p className="text-[var(--text-tertiary)]">Lead não encontrado.</p>
  }

  const interactions: Interaction[] = (lead as { interactions?: Interaction[] }).interactions ?? []
  const meta = getMeta(lead.metadata)
  const cleanSite = meta.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

  const scoreColor = lead.lead_score >= 70 ? '#10B981' : lead.lead_score >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                className="text-2xl font-bold text-[var(--text-primary)]"
                style={{
                  fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  letterSpacing: '-0.02em',
                }}
              >
                {lead.decisor_nome}
              </h2>
              {lead.decisor_cargo && (
                <p className="text-[var(--text-secondary)] text-sm mt-0.5">{lead.decisor_cargo}</p>
              )}
              {meta.nome_fantasia && meta.nome_fantasia !== lead.empresa_nome && (
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Empresa: <strong className="text-[var(--text-secondary)]">{meta.nome_fantasia}</strong>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold"
                style={{
                  backgroundColor: `color-mix(in oklab, ${scoreColor} 12%, transparent)`,
                  color: scoreColor,
                  fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                }}
              >
                <Star className="h-3.5 w-3.5" fill="currentColor" strokeWidth={2.5} />
                {lead.lead_score}
              </span>
              <PipelineBadge status={lead.status_pipeline as import('@/types').PipelineStatus} />
            </div>
          </div>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {lead.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CONTATO */}
      <Section title="Contato">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field icon={MessageSquare} color="#10B981" label="WhatsApp" value={lead.whatsapp} mono />
          {lead.email && <Field icon={Mail} color="#F59E0B" label="E-mail" value={lead.email} copyable />}
          {lead.telefone && <Field icon={Phone} color="#3B82F6" label="Telefone" value={lead.telefone} mono />}
          {lead.linkedin_url && (
            <Field
              icon={ExternalLink}
              color="#0A66C2"
              label="LinkedIn"
              value="Ver perfil"
              href={lead.linkedin_url}
            />
          )}
          {meta.website && (
            <Field
              icon={Globe}
              color="#8B5CF6"
              label="Website"
              value={cleanSite}
              href={meta.website}
            />
          )}
          {meta.telefones_extras && meta.telefones_extras.length > 0 && (
            <Field
              icon={Phone}
              color="#64748B"
              label="Telefones adicionais"
              value={meta.telefones_extras.join(' · ')}
              mono
            />
          )}
        </div>
      </Section>

      {/* EMPRESA */}
      <Section title="Empresa">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field icon={Building2} color="#3B82F6" label="Nome" value={lead.empresa_nome} />
          {lead.segmento && <Field icon={Briefcase} color="#A855F7" label="Segmento" value={lead.segmento} />}
          {lead.cnpj && <Field icon={Hash} color="#64748B" label="CNPJ" value={lead.cnpj} mono />}
          {meta.razao_social && <Field icon={FileText} color="#8B5CF6" label="Razão social" value={meta.razao_social} />}
          {meta.porte && (
            <Field
              icon={Building}
              color="#F97316"
              label="Porte"
              value={`${meta.porte}${meta.funcionarios_estimados ? ` · ~${meta.funcionarios_estimados} func.` : ''}`}
            />
          )}
          {meta.funcionarios_estimados && !meta.porte && (
            <Field icon={UsersIcon} color="#10B981" label="Funcionários" value={`~${meta.funcionarios_estimados}`} />
          )}
          {meta.data_abertura && (
            <Field icon={Calendar} color="#10B981" label="Abertura" value={formatDate(meta.data_abertura)} />
          )}
          {meta.capital_social !== null && meta.capital_social !== undefined && (
            <Field icon={DollarSign} color="#10B981" label="Capital social" value={formatBrl(meta.capital_social)} />
          )}
          {meta.natureza_juridica && (
            <Field icon={Landmark} color="#64748B" label="Natureza jurídica" value={meta.natureza_juridica} />
          )}
          {meta.situacao_cnpj && (
            <Field
              icon={meta.cnpj_ativo ? CheckCircle2 : XCircle}
              color={meta.cnpj_ativo ? '#10B981' : '#EF4444'}
              label="Situação CNPJ"
              value={meta.situacao_cnpj}
            />
          )}
          {meta.tipo && (
            <Field icon={Building2} color="#3B82F6" label="Tipo" value={meta.tipo} />
          )}
        </div>
      </Section>

      {/* LOCALIZAÇÃO */}
      {(lead.cidade || lead.estado || meta.endereco_completo || meta.cep) && (
        <Section title="Localização">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(lead.cidade || lead.estado) && (
              <Field
                icon={MapPin}
                color="#EF4444"
                label="Cidade / UF"
                value={[lead.cidade, lead.estado].filter(Boolean).join(', ')}
              />
            )}
            {meta.endereco_completo && (
              <Field icon={MapPin} color="#F97316" label="Endereço" value={meta.endereco_completo} />
            )}
            {meta.bairro && <Field icon={MapPin} color="#64748B" label="Bairro" value={meta.bairro} />}
            {meta.cep && <Field icon={Hash} color="#64748B" label="CEP" value={meta.cep} mono />}
          </div>
        </Section>
      )}

      {/* QUALIDADE / SINAIS */}
      {(meta.rating_maps !== undefined && meta.rating_maps > 0) || meta.score_detalhes ? (
        <Section title="Sinais de qualidade">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {meta.rating_maps !== undefined && meta.rating_maps > 0 && (
              <Field
                icon={Star}
                color="#F59E0B"
                label="Google Maps"
                value={`${meta.rating_maps.toFixed(1)}★${meta.total_avaliacoes ? ` · ${meta.total_avaliacoes} aval.` : ''}`}
              />
            )}
            {meta.score_detalhes && (
              <>
                <Field
                  icon={MapPin}
                  color="#10B981"
                  label="Presença Maps"
                  value={`${meta.score_detalhes.maps_presenca}/25`}
                />
                <Field
                  icon={User}
                  color="#8B5CF6"
                  label="Decisor"
                  value={`${meta.score_detalhes.decisor_encontrado}/25`}
                />
                <Field
                  icon={Mail}
                  color="#F59E0B"
                  label="E-mail validado"
                  value={`${meta.score_detalhes.email_validado}/25`}
                />
                <Field
                  icon={ExternalLink}
                  color="#0A66C2"
                  label="LinkedIn ativo"
                  value={`${meta.score_detalhes.linkedin_ativo}/25`}
                />
                <Field
                  icon={Building}
                  color="#F97316"
                  label="Porte compatível"
                  value={`${meta.score_detalhes.porte_match}/25`}
                />
              </>
            )}
          </div>
        </Section>
      ) : null}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle
            className="text-[15px] font-semibold"
            style={{
              fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            Timeline de interações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InteractionTimeline interactions={interactions} />
        </CardContent>
      </Card>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3
        className="text-[11px] font-bold uppercase text-[var(--text-tertiary)] px-1"
        style={{
          fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          letterSpacing: '0.08em',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}
