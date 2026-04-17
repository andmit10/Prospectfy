'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  UserSearch,
  Globe,
  BarChart3,
  ExternalLink,
  Mail,
  Phone,
  MessageCircle,
  Link2,
  MapPin,
  Calendar,
  Hash,
  Star,
  Briefcase,
} from 'lucide-react'
import type { Lead } from '@/types'
import { getMeta, StarRating, SourceBadge, deriveFontesAtivas } from './lead-visuals'
import { trpc } from '@/lib/trpc-client'
// Re-export note: `getMeta` is invoked inside each tab that needs it.

/**
 * Inline expanded-row panel. Mirrors the generator's LeadDetailPanel but reads
 * from the persisted Lead shape (+ metadata jsonb). Four tabs: Empresa, Decisor,
 * Website, Histórico.
 */
export function LeadDetailPanel({ lead }: { lead: Lead }) {
  const [tab, setTab] = useState<'empresa' | 'decisor' | 'website' | 'historico'>('empresa')

  const tabs = [
    { id: 'empresa' as const, label: 'Empresa', icon: Building2 },
    { id: 'decisor' as const, label: 'Decisor', icon: UserSearch },
    { id: 'website' as const, label: 'Contato & Web', icon: Globe },
    { id: 'historico' as const, label: 'Histórico', icon: BarChart3 },
  ]

  return (
    <div
      className="animate-fade-in"
      style={{
        backgroundColor: 'var(--surface-1)',
        borderTop: '1px solid var(--surface-3)',
        borderBottom: '1px solid var(--surface-3)',
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-4 pt-3"
        style={{ borderBottom: '1px solid var(--surface-3)' }}
      >
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setTab(t.id)
              }}
              className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
              )}
            </button>
          )
        })}
        <div className="ml-auto pb-2 pr-1">
          <Link
            href={`/leads/${lead.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-medium text-[var(--primary)] hover:underline"
          >
            Abrir página completa →
          </Link>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === 'empresa' && <EmpresaTab lead={lead} />}
        {tab === 'decisor' && <DecisorTab lead={lead} />}
        {tab === 'website' && <ContatoTab lead={lead} />}
        {tab === 'historico' && <HistoricoTab lead={lead} />}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono = false,
  link,
  icon,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  link?: string
  icon?: React.ReactNode
}) {
  const content = (
    <span
      className={`text-sm ${mono ? 'font-mono' : ''}`}
      style={{ color: 'var(--text-primary)' }}
    >
      {value || '—'}
    </span>
  )
  return (
    <div>
      <p
        className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {icon}
        {label}
      </p>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-sm hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          {content}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        content
      )}
    </div>
  )
}

function EmpresaTab({ lead }: { lead: Lead }) {
  const meta = getMeta(lead.metadata)
  const enderecoLine =
    meta.endereco_completo ??
    [
      meta.logradouro && `${meta.logradouro}${meta.numero ? `, ${meta.numero}` : ''}`,
      meta.bairro,
      meta.cep,
      lead.cidade && lead.estado && `${lead.cidade}/${lead.estado}`,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
      <Field label="Razão social" value={meta.razao_social} />
      <Field label="Nome fantasia" value={meta.nome_fantasia ?? lead.empresa_nome} />
      <Field label="Segmento" value={lead.segmento} icon={<Briefcase className="h-3 w-3" />} />
      <Field label="CNPJ" value={lead.cnpj} mono />
      <Field label="Situação CNPJ" value={meta.situacao_cnpj ?? (meta.cnpj_ativo === false ? 'Inativo' : 'Ativo')} />
      <Field
        label="Tipo"
        value={meta.tipo ?? '—'}
      />
      <Field
        label="Data de abertura"
        value={meta.data_abertura}
        icon={<Calendar className="h-3 w-3" />}
      />
      <Field label="Natureza jurídica" value={meta.natureza_juridica} />
      <Field
        label="Capital social"
        value={
          meta.capital_social
            ? new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              }).format(meta.capital_social)
            : '—'
        }
      />
      <Field label="Inscrição estadual" value={meta.inscricao_estadual} mono />
      <Field
        label="Simples / MEI"
        value={
          meta.opcao_mei
            ? 'MEI'
            : meta.opcao_simples
            ? 'Simples Nacional'
            : meta.opcao_simples === false
            ? 'Lucro presumido/real'
            : '—'
        }
      />
      <Field label="Porte" value={meta.porte} />
      <div className="md:col-span-3">
        <Field
          label="Endereço"
          value={enderecoLine || '—'}
          icon={<MapPin className="h-3 w-3" />}
        />
      </div>
      <div className="md:col-span-3">
        <Field label="Avaliação Google Maps" value={
          meta.rating_maps && meta.rating_maps > 0 ? (
            <span className="inline-flex items-center gap-2">
              <StarRating rating={meta.rating_maps} />
              <span className="text-xs text-[var(--text-tertiary)]">
                ({meta.total_avaliacoes ?? 0} avaliações)
              </span>
            </span>
          ) : (
            '—'
          )
        } />
      </div>
    </div>
  )
}

function DecisorTab({ lead }: { lead: Lead }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
      <Field label="Nome" value={lead.decisor_nome} />
      <Field label="Cargo" value={lead.decisor_cargo} />
      <Field label="Empresa" value={lead.empresa_nome} />
      <Field
        label="WhatsApp"
        value={lead.whatsapp}
        mono
        icon={<MessageCircle className="h-3 w-3" />}
        link={lead.whatsapp ? `https://wa.me/${lead.whatsapp.replace(/\D/g, '')}` : undefined}
      />
      <Field
        label="Telefone"
        value={lead.telefone}
        mono
        icon={<Phone className="h-3 w-3" />}
      />
      <Field
        label="Email"
        value={lead.email}
        icon={<Mail className="h-3 w-3" />}
        link={lead.email ? `mailto:${lead.email}` : undefined}
      />
      <Field
        label="LinkedIn"
        value={lead.linkedin_url ? 'Ver perfil' : '—'}
        icon={<Link2 className="h-3 w-3" />}
        link={lead.linkedin_url ?? undefined}
      />
      <Field
        label="Status email"
        value={
          lead.email_status === 'valid'
            ? '✓ Válido'
            : lead.email_status === 'catch_all'
            ? 'Catch-all'
            : lead.email_status === 'invalid'
            ? '✗ Inválido'
            : '—'
        }
      />
      <Field
        label="Score"
        value={<span className="font-mono">{lead.lead_score}</span>}
        icon={<Star className="h-3 w-3" />}
      />
    </div>
  )
}

function ContatoTab({ lead }: { lead: Lead }) {
  const meta = getMeta(lead.metadata)
  const fontesAtivas = deriveFontesAtivas(meta, {
    linkedin_url: lead.linkedin_url,
    email: lead.email,
  })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <Field
          label="Website"
          value={
            meta.website
              ? meta.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
              : '—'
          }
          icon={<Globe className="h-3 w-3" />}
          link={meta.website ?? undefined}
        />
        <Field
          label="Telefones adicionais"
          value={
            meta.telefones_extras && meta.telefones_extras.length > 0
              ? meta.telefones_extras.join(' · ')
              : '—'
          }
          mono
        />
      </div>
      <div>
        <p
          className="mb-2 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Fontes consultadas
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {fontesAtivas.map((id) => (
            <div key={id} className="inline-flex items-center gap-1.5">
              <SourceBadge id={id} />
              <span className="text-xs text-[var(--text-secondary)]">{id.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function HistoricoTab({ lead }: { lead: Lead }) {
  const { data, isLoading } = trpc.leads.getById.useQuery(lead.id)
  const interactions = (data as { interactions?: unknown[] } | undefined)?.interactions as
    | Array<{
        id: string
        canal: string
        tipo: string
        mensagem_enviada: string | null
        resposta_lead: string | null
        created_at: string
      }>
    | undefined

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
        Carregando histórico...
      </div>
    )
  }

  if (!interactions || interactions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
        Nenhuma interação ainda. Adicione o lead a uma campanha para começar.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {interactions.map((it) => (
        <div
          key={it.id}
          className="rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--surface-3)' }}
        >
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--text-secondary)]">
              {it.canal}
            </span>
            <span className="font-medium text-[var(--text-primary)]">{it.tipo}</span>
            <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
              {new Date(it.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          {it.mensagem_enviada && (
            <p className="text-xs text-[var(--text-secondary)]">
              <Hash className="mr-1 inline h-3 w-3" />
              {it.mensagem_enviada}
            </p>
          )}
          {it.resposta_lead && (
            <p className="mt-1 rounded bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-primary)]">
              ↳ {it.resposta_lead}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
