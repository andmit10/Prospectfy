'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc-client'
import {
  Sparkles,
  MapPin,
  Building2,
  Users,
  Phone,
  Mail,
  Link2,
  CheckSquare,
  Square,
  Download,
  RotateCcw,
  Star,
  Shield,
  ShieldCheck,
  Info,
  CheckCircle2,
  Loader2,
  Circle,
  Map,
  UserSearch,
  Search,
  FileCheck,
  BarChart3,
  Play,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  AlertTriangle,
  Copy,
  CalendarDays,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type ScoreDetails = {
  maps_presenca: number
  decisor_encontrado: number
  email_validado: number
  linkedin_ativo: number
  porte_match: number
}

type Decisor = {
  nome: string
  cargo: string
  email?: string
  linkedin_url?: string
  whatsapp?: string
  telefone?: string
  fonte?: string
}

type GeneratedLead = {
  empresa_nome: string
  decisor_nome: string
  decisor_cargo: string
  segmento: string
  cidade: string
  estado: string
  email: string
  whatsapp: string
  telefone: string
  linkedin_url: string
  cnpj: string
  cnpj_ativo: boolean
  rating_maps: number
  total_avaliacoes: number
  porte: string
  funcionarios_estimados: number
  score: number
  score_detalhes: ScoreDetails
  // Rich CNPJ/company details (optional — populated by backend when available)
  razao_social?: string
  nome_fantasia?: string
  data_abertura?: string
  capital_social?: number
  natureza_juridica?: string
  situacao_cnpj?: string
  inscricao_estadual?: string
  opcao_simples?: boolean
  opcao_mei?: boolean
  tipo?: 'Matriz' | 'Filial'
  // Endereço completo
  logradouro?: string
  numero?: string
  bairro?: string
  cep?: string
  endereco_completo?: string
  // Extras
  website?: string
  telefones_extras?: string[]
  outros_decisores?: Decisor[]
  fontes_consultadas?: string[]
}

type StatusFilter = 'all' | 'email' | 'linkedin' | 'partial' | 'pending' | 'cnpj_invalid'

type PipelineStep = {
  id: string
  label: string
  icon: typeof Map
  status: 'pending' | 'running' | 'done'
  message: string
}

type LogEntry = { time: string; message: string; type: 'info' | 'success' | 'ai' }

// ─── Constants ──────────────────────────────────────────────────────────────

const ESTADOS = [
  { value: 'AC', label: 'Acre' },{ value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },{ value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },{ value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },{ value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },{ value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },{ value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },{ value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },{ value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },{ value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },{ value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },{ value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },{ value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },{ value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
]

const SEGMENTOS_POPULARES = [
  // Tech / Digital
  'Tecnologia','Desenvolvimento de Software','SaaS','Marketing Digital','E-commerce',
  'Agência de Marketing','Agência de Publicidade','Design Gráfico','UX/UI Design',
  // Serviços profissionais
  'Contabilidade','Advocacia','Escritório de Advocacia','Consultoria',
  'Consultoria Empresarial','Consultoria de RH','Consultoria Financeira','Auditoria',
  'Arquitetura','Engenharia Civil','Engenharia Elétrica',
  // Saúde
  'Odontologia','Medicina','Clínica Médica','Clínica Odontológica',
  'Clínica de Estética','Clínica Veterinária','Psicologia','Fisioterapia',
  'Laboratório de Análises Clínicas','Farmácia','Ótica',
  // Construção / Indústria
  'Construção Civil','Construtora','Incorporadora','Imobiliária',
  'Indústria','Metalúrgica','Indústria Alimentícia','Indústria Química','Indústria Têxtil',
  // Comércio / Varejo
  'Comércio Varejista','Atacado','Distribuidora','Supermercado',
  'Loja de Roupas','Loja de Calçados','Joalheria','Papelaria',
  // Alimentação / Hospitalidade
  'Alimentação','Restaurante','Bar','Cafeteria','Padaria','Food Truck',
  'Hotel','Pousada','Turismo',
  // Educação
  'Educação','Escola','Faculdade','Curso Livre','Curso de Idiomas','EAD',
  // Logística / Transporte
  'Logística','Transportadora','Frota','Courier',
  // Outros
  'Academia / Fitness','Estética e Beleza','Salão de Beleza','Barbearia',
  'Pet Shop','Oficina Mecânica','Concessionária','Posto de Combustível',
  'Seguradora','Corretora de Seguros','Corretora de Imóveis','Gráfica',
  'Segurança Privada','Limpeza e Conservação',
  'Equipamentos de Proteção Individual (EPI)','Materiais de Construção',
]

const FONTES = [
  { id: 'google_maps', label: 'Google Maps', color: '#EA4335' },
  { id: 'quadro_societario', label: 'Quadro societário', color: 'var(--primary)' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
]

const PORTES: { value: string; label: string }[] = [
  { value: '', label: 'Todos os portes' },
  { value: 'micro', label: 'Micro (1–10)' },
  { value: 'pequeno', label: 'Pequeno (11–50)' },
  { value: 'medio', label: 'Médio (51–200)' },
  { value: 'grande', label: 'Grande (200+)' },
]

const QUANTIDADES = [10, 25, 50, 100, 200]

const INITIAL_PIPELINE: PipelineStep[] = [
  { id: 'maps', label: 'Maps', icon: Map, status: 'pending', message: '' },
  { id: 'decisor', label: 'Decisor', icon: UserSearch, status: 'pending', message: '' },
  { id: 'linkedin', label: 'LinkedIn', icon: Search, status: 'pending', message: '' },
  { id: 'email', label: 'Email', icon: FileCheck, status: 'pending', message: '' },
  { id: 'score', label: 'Output', icon: BarChart3, status: 'pending', message: '' },
]

const formSchema = z.object({
  segmento: z.string().min(1, 'Informe o segmento'),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  quantidade: z.number().min(10).max(200),
  cargo_alvo: z.string().optional(),
  rating_minimo: z.number().min(0).max(5),
  apenas_cnpj_ativo: z.boolean(),
  porte: z.string().optional(),
  fontes: z.array(z.string()).min(1, 'Selecione ao menos uma fonte'),
  // Advanced filters (all optional)
  bairro: z.string().optional(),
  raio_km: z.number().optional(),
  cargos_alvo: z.array(z.string()).optional(),
  rating_maximo: z.number().optional(),
  min_avaliacoes: z.number().optional(),
  funcionarios_min: z.number().optional(),
  funcionarios_max: z.number().optional(),
  faturamento_min: z.number().optional(),
  anos_empresa_min: z.number().optional(),
  exige_website: z.boolean().optional(),
  exige_email: z.boolean().optional(),
  exige_linkedin: z.boolean().optional(),
  excluir_termos: z.array(z.string()).optional(),
})

const CARGOS_SUGERIDOS = [
  'CEO', 'Diretor', 'Sócio', 'Gerente', 'Fundador',
  'Proprietário', 'Administrador', 'Head de Vendas', 'Head de Marketing',
  'CTO', 'CFO', 'COO', 'Diretor Comercial', 'Diretor de Operações',
]

type FormValues = z.infer<typeof formSchema>

// ─── Sub-components ─────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-3 w-3"
          style={{
            fill: i <= Math.round(rating) ? '#F59E0B' : 'transparent',
            color: i <= Math.round(rating) ? '#F59E0B' : 'var(--text-disabled)',
          }}
        />
      ))}
      <span className="ml-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{rating.toFixed(1)}</span>
    </span>
  )
}

/** Interactive 0–5 star picker. Click a star to set rating; click the same star twice to clear. */
function StarInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value
  const label =
    value === 0
      ? 'Qualquer'
      : value === 5
      ? 'Apenas 5 estrelas'
      : `${value.toFixed(1)}+ estrelas`

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((i) => {
          const active = i <= display
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(value === i ? 0 : i)}
              onMouseEnter={() => setHover(i)}
              aria-label={`${i} estrela${i > 1 ? 's' : ''} ou mais`}
              className="rounded transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]/50"
            >
              <Star
                className="h-5 w-5 transition-colors"
                style={{
                  fill: active ? '#F59E0B' : 'transparent',
                  color: active ? '#F59E0B' : 'var(--text-disabled)',
                  strokeWidth: 1.5,
                }}
              />
            </button>
          )
        })}
      </div>
      <span
        className="text-xs font-medium"
        style={{ color: value === 0 ? 'var(--text-tertiary)' : '#F59E0B' }}
      >
        {label}
      </span>
    </div>
  )
}

// ─── Results helpers ────────────────────────────────────────────────────────

const STATUS_FILTERS: { id: StatusFilter; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'all', label: 'Todos', icon: <Sparkles className="h-3 w-3" />, color: 'var(--primary)' },
  { id: 'email', label: 'Email validado', icon: <Mail className="h-3 w-3" />, color: 'var(--primary)' },
  { id: 'linkedin', label: 'LinkedIn only', icon: <Link2 className="h-3 w-3" />, color: '#0A66C2' },
  { id: 'partial', label: 'Parcial', icon: <AlertTriangle className="h-3 w-3" />, color: '#F59E0B' },
  { id: 'pending', label: 'Pendente', icon: <Loader2 className="h-3 w-3" />, color: 'var(--text-secondary)' },
  { id: 'cnpj_invalid', label: 'CNPJ inválido', icon: <AlertTriangle className="h-3 w-3" />, color: '#EF4444' },
]

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('pt-BR')
  } catch { return value }
}

function yearsSince(value?: string): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--
  return years > 0 ? `${years} ano${years > 1 ? 's' : ''}` : 'novo'
}

function computeLeadStatus(lead: GeneratedLead): StatusFilter {
  if (!lead.cnpj_ativo) return 'cnpj_invalid'
  if (lead.email && lead.email.length > 0) return 'email'
  if (lead.linkedin_url) return 'linkedin'
  if (lead.score_detalhes && (lead.score_detalhes.maps_presenca > 0 || lead.score_detalhes.decisor_encontrado > 0)) return 'partial'
  return 'pending'
}

/** Small labeled field used in the expanded detail panel */
function Field({ label, value, mono = false, link }: { label: string; value: React.ReactNode; mono?: boolean; link?: string }) {
  const content = (
    <span className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>
      {value || '—'}
    </span>
  )
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: '#0A66C2' }}>
          {content}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : content}
    </div>
  )
}

/** Copy-to-clipboard pill used for CNPJ, phone, email */
function CopyChip({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
          toast.success('Copiado', { duration: 1000 })
        })
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-[var(--success-muted)]"
      style={{ color: copied ? 'var(--primary)' : 'var(--text-secondary)' }}
      title="Copiar"
    >
      {label ?? value}
      {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  )
}

/** Source icon badge (tooltip-ready) */
function SourceBadge({ id }: { id: string }) {
  const src = FONTES.find(f => f.id === id)
  if (!src) return null
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-md"
      title={src.label}
      style={{ backgroundColor: `${src.color}18`, border: `1px solid ${src.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: src.color }} />
    </span>
  )
}

/** Tabbed detail panel shown when a lead row is expanded */
function LeadDetailPanel({ lead }: { lead: GeneratedLead }) {
  const [tab, setTab] = useState<'empresa' | 'decisor' | 'website' | 'historico'>('empresa')

  const tabs = [
    { id: 'empresa', label: 'Empresa', icon: Building2 },
    { id: 'decisor', label: 'Decisor', icon: UserSearch },
    { id: 'website', label: 'Website', icon: Globe },
    { id: 'historico', label: 'Histórico', icon: BarChart3 },
  ] as const

  const outrosDecisores = lead.outros_decisores ?? []
  const totalDecisores = 1 + outrosDecisores.length
  const enderecoCompleto = lead.endereco_completo
    ?? [lead.logradouro && `${lead.logradouro}${lead.numero ? `, ${lead.numero}` : ''}`, lead.bairro, lead.cep, lead.cidade && lead.estado && `${lead.cidade}/${lead.estado}`]
      .filter(Boolean)
      .join(' · ')

  return (
    <div
      className="animate-fade-in"
      style={{ backgroundColor: 'var(--surface-1)', borderTop: '1px solid var(--surface-3)', borderBottom: '1px solid var(--surface-3)' }}
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3" style={{ borderBottom: '1px solid var(--surface-3)' }}>
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setTab(t.id) }}
              className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
              style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ backgroundColor: 'var(--primary)' }} />}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === 'empresa' && (
          <div className="grid grid-cols-12 gap-5">
            {/* Left: registro */}
            <div className="col-span-8 space-y-4">
              <div>
                <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>INFORMAÇÕES DE REGISTRO</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="CNPJ" value={<CopyChip value={lead.cnpj} />} mono />
                  <Field label="INSCRIÇÃO ESTADUAL" value={lead.inscricao_estadual} mono />
                  <Field label="RAZÃO SOCIAL" value={lead.razao_social ?? lead.empresa_nome} />
                  <Field label="NOME FANTASIA" value={lead.nome_fantasia ?? lead.empresa_nome} />
                  <Field
                    label="DATA DE ABERTURA"
                    value={
                      lead.data_abertura ? (
                        <span className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                          {formatDate(lead.data_abertura)}
                          {yearsSince(lead.data_abertura) && (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>· {yearsSince(lead.data_abertura)}</span>
                          )}
                        </span>
                      ) : '—'
                    }
                  />
                  <Field
                    label="SITUAÇÃO"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {lead.cnpj_ativo ? (
                          <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                        ) : (
                          <Shield className="h-3.5 w-3.5" style={{ color: '#EF4444' }} />
                        )}
                        <span style={{ color: lead.cnpj_ativo ? 'var(--primary)' : '#EF4444' }}>
                          {lead.situacao_cnpj ?? (lead.cnpj_ativo ? 'Ativa' : 'Inativa/Baixada')}
                        </span>
                      </span>
                    }
                  />
                  <Field label="NATUREZA JURÍDICA" value={lead.natureza_juridica} />
                  <Field label="PORTE" value={lead.porte} />
                  <Field label="CAPITAL SOCIAL" value={formatCurrency(lead.capital_social)} mono />
                  <Field label="TIPO" value={lead.tipo} />
                  <Field
                    label="OPÇÃO SIMPLES"
                    value={lead.opcao_simples === undefined ? '—' : lead.opcao_simples ? 'Sim' : 'Não'}
                  />
                  <Field
                    label="OPÇÃO MEI"
                    value={lead.opcao_mei === undefined ? '—' : lead.opcao_mei ? 'Sim' : 'Não'}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>LOCALIZAÇÃO</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="LOGRADOURO" value={lead.logradouro && `${lead.logradouro}${lead.numero ? `, ${lead.numero}` : ''}`} />
                  <Field label="BAIRRO" value={lead.bairro} />
                  <Field label="CEP" value={lead.cep} mono />
                  <Field label="CIDADE / UF" value={`${lead.cidade}/${lead.estado}`} />
                  <div className="col-span-2">
                    <Field label="ENDEREÇO COMPLETO" value={enderecoCompleto} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: validações & rating */}
            <div className="col-span-4 space-y-4">
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>VALIDAÇÕES</p>
                <div className="space-y-2.5">
                  {[
                    { ok: lead.cnpj_ativo, label: 'CNPJ ativo na Receita' },
                    { ok: lead.rating_maps > 0, label: `Presente no Google Maps${lead.rating_maps > 0 ? ` (${lead.rating_maps.toFixed(1)}★)` : ''}` },
                    { ok: !!lead.email && lead.email.length > 0, label: 'E-mail validado' },
                    { ok: !!lead.linkedin_url, label: 'LinkedIn encontrado' },
                    { ok: !!lead.whatsapp, label: 'WhatsApp disponível' },
                  ].map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {v.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--primary)' }} /> : <Circle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-disabled)' }} />}
                      <span style={{ color: v.ok ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>GOOGLE MAPS</p>
                <div className="flex items-center justify-between">
                  <StarRating rating={lead.rating_maps} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lead.total_avaliacoes} avaliações</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'decisor' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                DECISORES ENCONTRADOS · {totalDecisores}
              </p>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Fonte primária: {lead.linkedin_url ? 'LinkedIn' : 'Quadro societário'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Primary decisor */}
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid color-mix(in oklab, var(--primary) 25%, transparent)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{lead.decisor_nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{lead.decisor_cargo}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in oklab, var(--primary) 8%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in oklab, var(--primary) 25%, transparent)' }}>
                    PRINCIPAL
                  </span>
                </div>
                <div className="space-y-2">
                  {lead.email && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                      <Mail className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} />
                      <CopyChip value={lead.email} />
                    </div>
                  )}
                  {lead.whatsapp && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                      <Phone className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} />
                      <CopyChip value={lead.whatsapp} />
                    </div>
                  )}
                  {lead.linkedin_url && (
                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-2 text-xs hover:underline" style={{ color: '#0A66C2' }}>
                      <Link2 className="h-3 w-3" /> LinkedIn <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Other decisors */}
              {outrosDecisores.map((d, i) => (
                <div key={i} className="rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.nome}</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{d.cargo}</p>
                  <div className="space-y-2">
                    {d.email && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}><Mail className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} /><CopyChip value={d.email} /></div>}
                    {d.whatsapp && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}><Phone className="h-3 w-3" style={{ color: 'var(--text-secondary)' }} /><CopyChip value={d.whatsapp} /></div>}
                    {d.linkedin_url && <a href={d.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-2 text-xs hover:underline" style={{ color: '#0A66C2' }}><Link2 className="h-3 w-3" /> LinkedIn <ExternalLink className="h-3 w-3" /></a>}
                  </div>
                </div>
              ))}

              {outrosDecisores.length === 0 && (
                <div className="rounded-lg p-4 flex items-center justify-center" style={{ backgroundColor: 'var(--surface-1)', border: '1px dashed var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Nenhum decisor adicional encontrado</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'website' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8 space-y-4">
              <Field
                label="WEBSITE"
                value={lead.website ?? '—'}
                link={lead.website}
              />
              <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4" style={{ color: '#0A66C2' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preview</p>
                </div>
                {lead.website ? (
                  <div className="rounded-md overflow-hidden" style={{ border: '1px solid var(--border)', aspectRatio: '16/9' }}>
                    <iframe
                      src={lead.website}
                      className="w-full h-full"
                      title={`Preview ${lead.empresa_nome}`}
                      sandbox="allow-same-origin"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Website não disponível</p>
                )}
              </div>
            </div>
            <div className="col-span-4 space-y-3">
              <Field label="TELEFONE PRINCIPAL" value={lead.telefone && <CopyChip value={lead.telefone} />} mono />
              {(lead.telefones_extras ?? []).map((t, i) => (
                <Field key={i} label={`TELEFONE ${i + 2}`} value={<CopyChip value={t} />} mono />
              ))}
              <Field label="E-MAIL" value={lead.email && <CopyChip value={lead.email} />} />
            </div>
          </div>
        )}

        {tab === 'historico' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold tracking-wide mb-3" style={{ color: 'var(--text-tertiary)' }}>BREAKDOWN DO SCORE</p>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Maps', value: lead.score_detalhes?.maps_presenca ?? 0, max: 20 },
                  { label: 'Decisor', value: lead.score_detalhes?.decisor_encontrado ?? 0, max: 25 },
                  { label: 'Email', value: lead.score_detalhes?.email_validado ?? 0, max: 20 },
                  { label: 'LinkedIn', value: lead.score_detalhes?.linkedin_ativo ?? 0, max: 20 },
                  { label: 'Porte', value: lead.score_detalhes?.porte_match ?? 0, max: 15 },
                ].map((s) => {
                  const pct = (s.value / s.max) * 100
                  const color = pct >= 70 ? 'var(--primary)' : pct >= 40 ? '#F59E0B' : '#EF4444'
                  return (
                    <div key={s.label} className="rounded-lg p-3" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>{s.label.toUpperCase()}</p>
                      <p className="text-lg font-bold mb-2" style={{ color }}>{s.value}<span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>/{s.max}</span></p>
                      <div className="h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreWithTooltip({ score, details }: { score: number; details?: ScoreDetails }) {
  const color = score >= 70 ? 'var(--primary)' : score >= 50 ? '#F59E0B' : '#EF4444'
  const items = details ? [
    { label: 'Presença no Maps', value: details.maps_presenca, max: 20 },
    { label: 'Decisor encontrado', value: details.decisor_encontrado, max: 25 },
    { label: 'E-mail validado', value: details.email_validado, max: 20 },
    { label: 'LinkedIn ativo', value: details.linkedin_ativo, max: 20 },
    { label: 'Porte compatível', value: details.porte_match, max: 15 },
  ] : []

  return (
    <Tooltip>
      <TooltipTrigger>
        <button className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 cursor-help" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
          <span className="text-xs font-bold" style={{ color }}>{score}</span>
          <Info className="h-3 w-3" style={{ color: `${color}80` }} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="w-56 p-3" style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--border-strong)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>ProspectScore: {score}/100</p>
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 rounded-full" style={{ backgroundColor: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(item.value / item.max) * 100}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs font-mono w-8 text-right" style={{ color: 'var(--text-secondary)' }}>
                  {item.value}/{item.max}
                </span>
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Modern pipeline visual — replaces the cramped 5-icon row with:
 *  - Bigger 14-px circular nodes with breathing animation on the active step
 *  - Connecting bars rendered with a moving gradient (CSS keyframes below)
 *  - Sub-message of the active step rendered as a subtle "now doing" pill
 *  - Top-level shimmer-progress bar with milestone numbering
 *
 * Animations are pure CSS so we don't pull framer-motion just for this.
 */
function PipelineVisual({ steps, progress }: { steps: PipelineStep[]; progress: number }) {
  const activeStep = steps.find((s) => s.status === 'running')
  const completedCount = steps.filter((s) => s.status === 'done').length

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background:
          'linear-gradient(135deg, var(--surface-2) 0%, color-mix(in oklab, var(--primary) 4%, var(--surface-2)) 100%)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Embedded keyframes — local to this component */}
      <style>{`
        @keyframes orbya-breath {
          0%,100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 35%, transparent); }
          50%     { transform: scale(1.06); box-shadow: 0 0 0 10px color-mix(in oklab, var(--primary) 0%, transparent); }
        }
        @keyframes orbya-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes orbya-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .orbya-breath { animation: orbya-breath 1.6s ease-in-out infinite; }
        .orbya-flow {
          background: linear-gradient(90deg,
            color-mix(in oklab, var(--primary) 30%, transparent) 0%,
            var(--primary) 50%,
            color-mix(in oklab, var(--primary) 30%, transparent) 100%);
          background-size: 200% 100%;
          animation: orbya-flow 1.8s linear infinite;
        }
      `}</style>

      {/* Header — counter + activity */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {completedCount === steps.length ? 'Pronto' : 'Processando'}
          </span>
          <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {completedCount}/{steps.length}
          </span>
        </div>
        {activeStep?.message && (
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
              color: 'var(--primary)',
              maxWidth: 360,
            }}
            title={activeStep.message}
          >
            {activeStep.message.length > 50
              ? activeStep.message.slice(0, 50) + '…'
              : activeStep.message}
          </span>
        )}
      </div>

      {/* Stepper */}
      <div className="mb-5 flex items-start justify-between">
        {steps.map((step, i) => {
          const Icon = step.icon
          const isDone = step.status === 'done'
          const isRunning = step.status === 'running'
          return (
            <div
              key={step.id}
              className="flex items-center"
              style={{ flex: i < steps.length - 1 ? 1 : undefined }}
            >
              <div className="flex flex-col items-center gap-2" style={{ minWidth: 56 }}>
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-all duration-500 ${
                    isRunning ? 'orbya-breath' : ''
                  }`}
                  style={{
                    backgroundColor: isDone
                      ? 'var(--primary)'
                      : isRunning
                        ? 'color-mix(in oklab, var(--primary) 16%, var(--surface-1))'
                        : 'var(--surface-1)',
                    border: `2px solid ${
                      isDone
                        ? 'var(--primary)'
                        : isRunning
                          ? 'var(--primary)'
                          : 'var(--border-strong)'
                    }`,
                  }}
                >
                  {isDone ? (
                    <CheckCircle2
                      className="h-6 w-6"
                      style={{ color: 'var(--primary-foreground, #fff)' }}
                    />
                  ) : isRunning ? (
                    <Loader2
                      className="h-6 w-6 animate-spin"
                      style={{ color: 'var(--primary)' }}
                    />
                  ) : (
                    <Icon className="h-5 w-5" style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{
                    color:
                      step.status !== 'pending'
                        ? 'var(--text-primary)'
                        : 'var(--text-tertiary)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="relative mx-3 mt-7 h-1 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--border)' }}
                >
                  {isDone && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: 'var(--primary)' }}
                    />
                  )}
                  {isRunning && <div className="orbya-flow absolute inset-0 rounded-full" />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom progress bar with shimmer */}
      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--border)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${progress}%`,
            background:
              'linear-gradient(90deg, color-mix(in oklab, var(--primary) 70%, transparent) 0%, var(--primary) 100%)',
          }}
        />
        {progress > 0 && progress < 100 && (
          <div
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, color-mix(in oklab, #fff 35%, transparent) 50%, transparent 100%)',
              animation: 'orbya-shimmer 1.6s ease-in-out infinite',
            }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-end">
        <span className="font-mono text-xs font-semibold" style={{ color: 'var(--primary)' }}>
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  )
}

/**
 * Skeleton cards rendered below the pipeline while leads are being generated.
 * Gives the user something to look at instead of an empty white space, and
 * builds anticipation. Count matches the requested quantity (capped at 12 to
 * stay above the fold).
 */
function SkeletonCards({ count }: { count: number }) {
  const visible = Math.min(count, 12)
  return (
    <div className="space-y-2">
      <p
        className="text-xs font-semibold uppercase"
        style={{ color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}
      >
        Preparando {count} {count === 1 ? 'lead' : 'leads'}…
      </p>
      <div className="space-y-1.5">
        {Array.from({ length: visible }).map((_, i) => (
          <div
            key={i}
            className="relative h-14 overflow-hidden rounded-lg"
            style={{
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div
              className="absolute inset-y-0 w-1/3"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--primary) 8%, transparent) 50%, transparent 100%)',
                animation: 'orbya-shimmer 1.4s ease-in-out infinite',
                animationDelay: `${i * 80}ms`,
              }}
            />
            <div className="flex h-full items-center gap-3 px-4">
              <div
                className="h-8 w-8 rounded-full"
                style={{ backgroundColor: 'var(--surface-3)' }}
              />
              <div className="flex-1 space-y-1.5">
                <div
                  className="h-2.5 rounded"
                  style={{ width: '40%', backgroundColor: 'var(--surface-3)' }}
                />
                <div
                  className="h-2 rounded"
                  style={{ width: '24%', backgroundColor: 'var(--surface-3)' }}
                />
              </div>
              <div
                className="h-6 w-12 rounded-full"
                style={{ backgroundColor: 'var(--surface-3)' }}
              />
            </div>
          </div>
        ))}
        {count > visible && (
          <p className="pt-1 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
            + {count - visible} {count - visible === 1 ? 'lead' : 'leads'} a caminho…
          </p>
        )}
      </div>
    </div>
  )
}

function ActivityLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="rounded-xl p-4 max-h-40 overflow-y-auto" style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-3)' }}>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>Calculando ProspectScore e exportando</p>
      <div className="space-y-1">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="font-mono shrink-0" style={{ color: 'var(--text-disabled)' }}>{entry.time}</span>
            <span style={{ color: entry.type === 'success' ? 'var(--primary)' : entry.type === 'ai' ? '#D4A574' : 'var(--text-secondary)' }}>
              {entry.type === 'success' ? '✓' : entry.type === 'ai' ? '🤖' : '→'}{' '}
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Google logo (inline, official colors) ─────────────────────────────────

function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 272 92"
      height="14"
      aria-label="Google"
      style={{ display: 'block' }}
    >
      <path fill="#EA4335" d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" />
      <path fill="#FBBC05" d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" />
      <path fill="#4285F4" d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z" />
      <path fill="#34A853" d="M225 3v65h-9.5V3h9.5z" />
      <path fill="#EA4335" d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z" />
      <path fill="#4285F4" d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z" />
    </svg>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function LeadGenerator() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [results, setResults] = useState<GeneratedLead[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<
    | { type: 'success'; imported: number; skipped: number }
    | { type: 'error'; message: string }
    | null
  >(null)
  const [pipeline, setPipeline] = useState<PipelineStep[]>(INITIAL_PIPELINE)
  const [progress, setProgress] = useState(0)
  const [requestedQty, setRequestedQty] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [porteFilter, setPorteFilter] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [excluirInput, setExcluirInput] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      segmento: '',
      cidade: '',
      estado: '',
      quantidade: 50,
      cargo_alvo: '',
      rating_minimo: 0,
      apenas_cnpj_ativo: false,
      porte: '',
      fontes: ['google_maps', 'claude_ai'],
      bairro: '',
      cargos_alvo: [],
      excluir_termos: [],
      exige_website: false,
      exige_email: false,
      exige_linkedin: false,
    },
  })

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev, { time, message, type }])
  }, [])

  async function onSubmit(values: FormValues) {
    setResults([])
    setSelected(new Set())
    setIsGenerating(true)
    setPipeline(INITIAL_PIPELINE)
    setProgress(0)
    setLogs([])
    setStats({})
    setRequestedQty(values.quantidade ?? 0)

    try {
      const res = await fetch('/api/generate-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const reader = res.body?.getReader()
      if (!reader) { toast.error('Erro de conexão'); return }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue

          const data = JSON.parse(dataLine.slice(6))

          if (data.type === 'progress') {
            setPipeline(prev => prev.map(s =>
              s.id === data.step ? { ...s, status: data.status, message: data.message } : s
            ))
            addLog(data.message, data.status === 'done' ? 'success' : 'info')

            // Update progress
            const stepIndex = INITIAL_PIPELINE.findIndex(s => s.id === data.step)
            if (data.status === 'done') {
              setProgress(Math.min(((stepIndex + 1) / INITIAL_PIPELINE.length) * 100, 100))
            } else {
              setProgress(Math.min(((stepIndex + 0.5) / INITIAL_PIPELINE.length) * 100, 95))
            }
          }

          if (data.type === 'complete') {
            setResults(data.leads)
            setSelected(new Set(data.leads.map((_: GeneratedLead, i: number) => i)))
            setStats(data.stats)
            setProgress(100)
            addLog(`Concluído — ${data.total} leads gerados`, 'success')
            toast.success(`${data.total} leads gerados com sucesso!`)
            // Refresh the trial badge so the counter updates immediately.
            utils.trial.getStatus.invalidate()
          }

          if (data.type === 'error') {
            if (data.reason === 'trial_expired' || data.reason === 'trial_quota') {
              toast.error(data.message, {
                duration: 10_000,
                action: {
                  label: 'Ver planos',
                  onClick: () => router.push('/settings/billing'),
                },
              })
              // Refresh the trial badge so the header reflects the new state.
              await utils.trial.getStatus.invalidate()
            } else {
              toast.error(data.message)
            }
            addLog(data.message, 'info')
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar leads')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleImport() {
    const toImport = results.filter((_, i) => selected.has(i))
    if (toImport.length === 0) {
      toast.warning('Selecione ao menos um lead')
      return
    }

    setIsImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/import-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: toImport }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data.error || 'Erro ao importar'
        setImportResult({ type: 'error', message })
        toast.error(message)
        return
      }

      const imported = data.imported ?? 0
      const skipped = data.skipped ?? 0

      // Invalidate cached /leads query so the list reflects the new rows.
      await utils.leads.list.invalidate()

      setImportResult({ type: 'success', imported, skipped })
      if (imported === 0 && skipped > 0) {
        toast.warning(
          `Todos os ${skipped} leads já estavam na sua lista (duplicados).`
        )
      } else if (skipped > 0) {
        toast.success(`${imported} importados · ${skipped} já existiam`)
      } else {
        toast.success(`${imported} leads importados com sucesso!`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar'
      setImportResult({ type: 'error', message })
      toast.error(message)
    } finally {
      setIsImporting(false)
    }
  }

  function toggleSelect(idx: number) {
    setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }
  function toggleAll() {
    setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)))
  }
  function resetAll() {
    setResults([]); setSelected(new Set()); setPipeline(INITIAL_PIPELINE); setProgress(0); setLogs([]); setStats({})
  }

  const hasResults = results.length > 0 && !isGenerating
  const allSelected = results.length > 0 && selected.size === results.length

  return (
    <div className="space-y-4">

      {/* ── Form + Filtros ── */}
      <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Segmento + Região */}
            <div className="grid grid-cols-3 gap-3">
              {/* Segmento column: input + Quantidade pills stacked */}
              <div className="space-y-3">
                <FormField control={form.control} name="segmento" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      <Building2 className="inline h-3 w-3 mr-1" />SEGMENTO
                    </FormLabel>
                    <FormControl>
                      <AutocompleteInput
                        value={field.value}
                        onChange={field.onChange}
                        suggestions={SEGMENTOS_POPULARES}
                        placeholder="Comece a digitar: Tecnologia, Odonto, EPI..."
                        icon={<Search className="h-3.5 w-3.5" />}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="quantidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      QUANTIDADE
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-1.5">
                        {QUANTIDADES.map((n) => {
                          const active = field.value === n
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => field.onChange(n)}
                              className="flex h-9 min-w-[52px] items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors"
                              style={{
                                backgroundColor: active ? 'color-mix(in oklab, var(--primary) 8%, transparent)' : 'transparent',
                                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                                color: active ? 'var(--primary)' : 'var(--text-secondary)',
                              }}
                            >
                              {n}
                            </button>
                          )
                        })}
                      </div>
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="cidade" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    <MapPin className="inline h-3 w-3 mr-1" />CIDADE
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Belo Horizonte" {...field} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="estado" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>ESTADO</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full h-9 font-sans" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: field.value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="font-sans" style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                      {ESTADOS.map(e => <SelectItem key={e.value} value={e.value} className="font-sans" style={{ color: 'var(--text-primary)' }}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            {/* ── FILTROS DE QUALIFICAÇÃO ── */}
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wide" style={{ color: 'var(--text-tertiary)' }}>FILTROS DE QUALIFICAÇÃO</p>
              <div className="grid grid-cols-12 gap-4 items-end">
                {/* Rating mínimo Maps (stars) */}
                <FormField control={form.control} name="rating_minimo" render={({ field }) => (
                  <FormItem className="col-span-5">
                    <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      <Star className="inline h-3 w-3 mr-1" style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                      RATING MÍNIMO NO MAPS
                    </FormLabel>
                    <FormControl>
                      <StarInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />

                {/* Porte — native HTML select for clean look */}
                <FormField control={form.control} name="porte" render={({ field }) => (
                  <FormItem className="col-span-4">
                    <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      <Users className="inline h-3 w-3 mr-1" />
                      PORTE (FUNCIONÁRIOS LINKEDIN)
                    </FormLabel>
                    <FormControl>
                      <select
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-9 w-full rounded-md border px-3 text-sm outline-none transition-colors focus:border-[var(--primary)]/60"
                        style={{
                          backgroundColor: 'var(--surface-1)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-primary)',
                          fontFamily: 'inherit',
                        }}
                      >
                        {PORTES.map((p) => (
                          <option key={p.value} value={p.value} style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                  </FormItem>
                )} />

                {/* CNPJ Ativo — simple green checkbox */}
                <FormField control={form.control} name="apenas_cnpj_ativo" render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      CNPJ ATIVO APENAS
                    </FormLabel>
                    <FormControl>
                      <label className="flex h-9 items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 appearance-none rounded-[4px] border cursor-pointer transition-colors relative before:content-[''] before:absolute before:inset-0 before:flex before:items-center before:justify-center"
                          style={{
                            backgroundColor: field.value ? 'var(--primary)' : 'transparent',
                            borderColor: field.value ? 'var(--primary)' : 'var(--border-strong)',
                            backgroundImage: field.value
                              ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none'><path d='M2 6l3 3 5-6' stroke='%230A0A0A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>\")"
                              : undefined,
                            backgroundSize: '100% 100%',
                            backgroundRepeat: 'no-repeat',
                          }}
                        />
                        <span className="text-sm font-medium" style={{ color: field.value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          Somente CNPJ ativos
                        </span>
                      </label>
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Advanced filters toggle ── */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: showAdvanced ? 'var(--primary)' : 'var(--text-secondary)' }}
              >
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Filtros avançados
                {!showAdvanced && <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>· opcional</span>}
              </button>
            </div>

            {showAdvanced && (
              <div className="animate-fade-in rounded-lg p-4 space-y-4" style={{ backgroundColor: 'var(--surface-1)', border: '1px dashed var(--border)' }}>
                {/* Row 1 — Localização granular */}
                <div>
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>LOCALIZAÇÃO GRANULAR</p>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField control={form.control} name="bairro" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>BAIRRO / REGIÃO</FormLabel>
                        <FormControl>
                          <Input placeholder="Savassi, Zona Sul..." {...field} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="raio_km" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>RAIO (KM)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ex: 10"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))}
                            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Row 2 — Perfil de decisor */}
                <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>PERFIL DE DECISOR</p>
                  <FormField control={form.control} name="cargos_alvo" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>CARGOS ALVO (múltiplos)</FormLabel>
                      <FormControl>
                        <div className="flex flex-wrap gap-1.5">
                          {CARGOS_SUGERIDOS.map((cargo) => {
                            const selected = (field.value ?? []).includes(cargo)
                            return (
                              <button
                                key={cargo}
                                type="button"
                                onClick={() => {
                                  const curr = field.value ?? []
                                  field.onChange(selected ? curr.filter((c) => c !== cargo) : [...curr, cargo])
                                }}
                                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs transition-colors"
                                style={{
                                  backgroundColor: selected ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : 'var(--surface-1)',
                                  border: `1px solid ${selected ? 'color-mix(in oklab, var(--primary) 38%, transparent)' : 'var(--border)'}`,
                                  color: selected ? 'var(--primary)' : 'var(--text-secondary)',
                                }}
                              >
                                {cargo}
                              </button>
                            )
                          })}
                        </div>
                      </FormControl>
                    </FormItem>
                  )} />
                </div>

                {/* Row 3 — Qualidade e volume Maps */}
                <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>QUALIDADE NO GOOGLE MAPS</p>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField control={form.control} name="rating_maximo" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>RATING MÁXIMO</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Ex: 4.9 (para priorizar médios)"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="min_avaliacoes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>MIN. AVALIAÇÕES</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ex: 20"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))}
                            style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Row 4 — Tamanho da empresa */}
                <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>TAMANHO DA EMPRESA</p>
                  <div className="grid grid-cols-4 gap-3">
                    <FormField control={form.control} name="funcionarios_min" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>FUNCIONÁRIOS MIN.</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Ex: 10" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="funcionarios_max" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>FUNCIONÁRIOS MAX.</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Ex: 200" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="faturamento_min" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>FATURAMENTO MIN. (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Ex: 500000" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="anos_empresa_min" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>IDADE MIN. (ANOS)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="Ex: 3" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value))} style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Row 5 — Presença digital obrigatória */}
                <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>PRESENÇA DIGITAL (OBRIGATÓRIA)</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'exige_website' as const, label: 'Ter website', icon: <Globe className="h-3 w-3" /> },
                      { name: 'exige_email' as const, label: 'Ter e-mail corporativo', icon: <Mail className="h-3 w-3" /> },
                      { name: 'exige_linkedin' as const, label: 'Ter LinkedIn', icon: <Link2 className="h-3 w-3" /> },
                    ].map((opt) => (
                      <FormField key={opt.name} control={form.control} name={opt.name} render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <button
                              type="button"
                              onClick={() => field.onChange(!field.value)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                              style={{
                                backgroundColor: field.value ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : 'var(--surface-1)',
                                border: `1px solid ${field.value ? 'color-mix(in oklab, var(--primary) 38%, transparent)' : 'var(--border)'}`,
                                color: field.value ? 'var(--primary)' : 'var(--text-secondary)',
                              }}
                            >
                              {opt.icon}
                              {opt.label}
                              {field.value && <CheckCircle2 className="h-3 w-3" />}
                            </button>
                          </FormControl>
                        </FormItem>
                      )} />
                    ))}
                  </div>
                </div>

                {/* Row 6 — Exclusões */}
                <div style={{ borderTop: '1px solid var(--surface-3)' }} className="pt-4">
                  <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: 'var(--text-tertiary)' }}>EXCLUSÕES (BLACKLIST)</p>
                  <FormField control={form.control} name="excluir_termos" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[10px] font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                        TERMOS A EXCLUIR <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(Enter para adicionar)</span>
                      </FormLabel>
                      <div className="space-y-2">
                        <Input
                          placeholder="Ex: franquia, concorrente X..."
                          value={excluirInput}
                          onChange={(e) => setExcluirInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && excluirInput.trim()) {
                              e.preventDefault()
                              const curr = field.value ?? []
                              if (!curr.includes(excluirInput.trim())) {
                                field.onChange([...curr, excluirInput.trim()])
                              }
                              setExcluirInput('')
                            }
                          }}
                          style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        />
                        {(field.value ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {(field.value ?? []).map((term) => (
                              <span
                                key={term}
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
                                style={{ backgroundColor: '#EF444418', color: '#EF4444', border: '1px solid #EF444440' }}
                              >
                                {term}
                                <button
                                  type="button"
                                  onClick={() => field.onChange((field.value ?? []).filter((t) => t !== term))}
                                  className="hover:opacity-70"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </FormItem>
                  )} />
                </div>

                {/* Reset advanced */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      form.setValue('bairro', '')
                      form.setValue('raio_km', undefined)
                      form.setValue('cargos_alvo', [])
                      form.setValue('rating_maximo', undefined)
                      form.setValue('min_avaliacoes', undefined)
                      form.setValue('funcionarios_min', undefined)
                      form.setValue('funcionarios_max', undefined)
                      form.setValue('faturamento_min', undefined)
                      form.setValue('anos_empresa_min', undefined)
                      form.setValue('exige_website', false)
                      form.setValue('exige_email', false)
                      form.setValue('exige_linkedin', false)
                      form.setValue('excluir_termos', [])
                    }}
                    className="text-xs underline"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    Limpar filtros avançados
                  </button>
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isGenerating}
                className="h-10 px-6 text-sm font-semibold"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--background)' }}
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" /> Gerar Leads</>
                )}
              </Button>
              {hasResults && (
                <Button type="button" variant="outline" onClick={resetAll} className="h-10 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <RotateCcw className="h-3 w-3 mr-2" /> Nova busca
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>

      {/* ── Pipeline + Log ── */}
      {(isGenerating || hasResults) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {hasResults
                ? `✅ Concluído — ${results.length} leads gerados`
                : '⏳ Processando...'}
            </p>
            {hasResults && (
              <Button size="sm" onClick={resetAll} className="text-xs h-7" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} variant="outline">
                <RotateCcw className="h-3 w-3 mr-1" /> Concluído
              </Button>
            )}
          </div>
          <PipelineVisual steps={pipeline} progress={progress} />
          {isGenerating && requestedQty > 0 && <SkeletonCards count={requestedQty} />}
          <ActivityLog entries={logs} />
        </div>
      )}

      {/* ── Resultados ── */}
      {hasResults && (() => {
        // Derive filtered results
        const statuses = results.map((l) => computeLeadStatus(l))
        const portesUnicos = Array.from(new Set(results.map((l) => l.porte).filter(Boolean)))
        const filtered = results
          .map((lead, origIdx) => ({ lead, origIdx, status: statuses[origIdx] }))
          .filter(({ lead, status }) => {
            if (statusFilter !== 'all' && status !== statusFilter) return false
            if (porteFilter && lead.porte !== porteFilter) return false
            return true
          })

        const statusCounts: Record<StatusFilter, number> = {
          all: results.length,
          email: statuses.filter((s) => s === 'email').length,
          linkedin: statuses.filter((s) => s === 'linkedin').length,
          partial: statuses.filter((s) => s === 'partial').length,
          pending: statuses.filter((s) => s === 'pending').length,
          cnpj_invalid: statuses.filter((s) => s === 'cnpj_invalid').length,
        }

        return (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {/* ── Header with title + filter bar + import ── */}
            <div className="px-4 py-3 space-y-3" style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {/* Top row: title + import */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Lista de leads</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in oklab, var(--primary) 8%, transparent)', color: 'var(--primary)' }}>
                    {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}
                  </span>
                  <button type="button" onClick={toggleAll} className="flex items-center gap-1.5 text-xs transition-colors hover:text-[var(--text-primary)]" style={{ color: 'var(--text-secondary)' }}>
                    {allSelected ? <CheckSquare className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} /> : <Square className="h-3.5 w-3.5" />}
                    {selected.size}/{results.length} selecionados
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {stats.score_medio !== undefined && (
                    <span className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: '#F59E0B15', color: '#F59E0B' }}>
                      Score médio: {stats.score_medio}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleImport}
                    disabled={selected.size === 0 || isImporting}
                    className="text-xs h-8 font-semibold"
                    style={{ backgroundColor: 'var(--primary)', color: 'var(--background)' }}
                  >
                    {isImporting ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Importando...</> : <><Download className="h-3 w-3 mr-1" /> Importar ({selected.size})</>}
                  </Button>
                </div>
              </div>

              {/* Persistent import result banner */}
              {importResult && importResult.type === 'success' && (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--primary) 30%, transparent)',
                    color: 'var(--primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium">
                      {importResult.imported > 0
                        ? `${importResult.imported} lead${importResult.imported !== 1 ? 's' : ''} importado${importResult.imported !== 1 ? 's' : ''} com sucesso`
                        : 'Nenhum lead novo importado'}
                      {importResult.skipped > 0 && ` · ${importResult.skipped} já existia${importResult.skipped !== 1 ? 'm' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {importResult.imported > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => router.push('/leads')}
                      >
                        Ver em /leads
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setImportResult(null)}
                      className="opacity-60 hover:opacity-100"
                      aria-label="Fechar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {importResult && importResult.type === 'error' && (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'color-mix(in oklab, #EF4444 10%, transparent)',
                    border: '1px solid color-mix(in oklab, #EF4444 30%, transparent)',
                    color: '#EF4444',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">Erro na importação: {importResult.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportResult(null)}
                    className="opacity-60 hover:opacity-100"
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Filter chips + porte filter */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {STATUS_FILTERS.map((f) => {
                    const count = statusCounts[f.id]
                    const active = statusFilter === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
                        style={{
                          backgroundColor: active ? `${f.color}18` : 'transparent',
                          border: `1px solid ${active ? `${f.color}60` : 'var(--border)'}`,
                          color: active ? f.color : 'var(--text-secondary)',
                        }}
                      >
                        {f.icon}
                        {f.label}
                        <span className="text-[10px] opacity-60">{count}</span>
                      </button>
                    )
                  })}
                </div>
                <select
                  value={porteFilter}
                  onChange={(e) => setPorteFilter(e.target.value)}
                  className="h-8 rounded-md border px-2.5 text-xs outline-none transition-colors font-sans"
                  style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border)', color: porteFilter ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit' }}
                >
                  <option value="">Todos os portes</option>
                  {portesUnicos.map((p) => (
                    <option key={p} value={p} style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-primary)' }}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto" style={{ backgroundColor: 'var(--surface-1)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-3)' }}>
                    <th className="w-6" />
                    <th className="w-8 py-2.5 px-2 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>SCORE</th>
                    <th className="w-10 py-2.5 px-2 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>#</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>EMPRESA / CNPJ</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>ENDEREÇO</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>TELEFONE / RATING</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>PORTE</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>WEBSITE</th>
                    <th className="py-2.5 px-3 text-left font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>DECISOR</th>
                    <th className="py-2.5 px-3 text-center font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>LINKEDIN</th>
                    <th className="py-2.5 px-3 text-center font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>EMAIL</th>
                    <th className="py-2.5 px-3 text-center font-semibold tracking-wide" style={{ color: 'var(--text-tertiary)' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="h-6 w-6" style={{ color: 'var(--text-disabled)' }} />
                          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum lead corresponde aos filtros</p>
                          <button type="button" onClick={() => { setStatusFilter('all'); setPorteFilter('') }} className="text-xs underline" style={{ color: 'var(--primary)' }}>
                            Limpar filtros
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.map(({ lead, origIdx, status }) => {
                    const isSelected = selected.has(origIdx)
                    const isExpanded = expanded === origIdx
                    const statusMeta = STATUS_FILTERS.find(s => s.id === status) ?? STATUS_FILTERS[4]

                    return (
                      <React.Fragment key={origIdx}>
                        <tr
                          onClick={() => setExpanded(isExpanded ? null : origIdx)}
                          className="cursor-pointer transition-colors group"
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--surface-3)',
                            backgroundColor: isExpanded ? 'var(--surface-2)' : isSelected ? 'color-mix(in oklab, var(--primary) 3%, transparent)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (!isSelected && !isExpanded) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-2)' }}
                          onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? 'color-mix(in oklab, var(--primary) 3%, transparent)' : 'transparent' }}
                        >
                          {/* Expand chevron + checkbox */}
                          <td className="px-2" onClick={e => { e.stopPropagation(); toggleSelect(origIdx) }}>
                            <div className="flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />}
                              <div className="flex h-3.5 w-3.5 items-center justify-center rounded" style={{ border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--text-disabled)'}`, backgroundColor: isSelected ? 'var(--primary)' : 'transparent' }}>
                                {isSelected && <svg viewBox="0 0 10 8" className="h-2 w-2" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="var(--primary-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                              </div>
                            </div>
                          </td>
                          {/* Score */}
                          <td className="py-2.5 px-2">
                            <span className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold" style={{ backgroundColor: `${lead.score >= 70 ? 'var(--primary)' : lead.score >= 50 ? '#F59E0B' : '#EF4444'}15`, color: lead.score >= 70 ? 'var(--primary)' : lead.score >= 50 ? '#F59E0B' : '#EF4444' }}>
                              {lead.score}
                            </span>
                          </td>
                          {/* # */}
                          <td className="py-2.5 px-2 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                            {String(origIdx + 1).padStart(3, '0')}
                          </td>
                          {/* Empresa / CNPJ */}
                          <td className="py-2.5 px-3">
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{lead.empresa_nome}</p>
                            <p className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{lead.cnpj || '—'}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{lead.segmento}</p>
                          </td>
                          {/* Endereço */}
                          <td className="py-2.5 px-3">
                            <p style={{ color: 'var(--text-primary)' }}>{lead.logradouro ? `${lead.logradouro}${lead.numero ? `, ${lead.numero}` : ''}` : `${lead.cidade}/${lead.estado}`}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                              {lead.bairro ?? lead.cidade} {lead.cep && `· ${lead.cep}`}
                            </p>
                          </td>
                          {/* Telefone / Rating */}
                          <td className="py-2.5 px-3">
                            <p style={{ color: 'var(--text-primary)' }}>{lead.telefone || lead.whatsapp || '—'}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <StarRating rating={lead.rating_maps} />
                              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>({lead.total_avaliacoes})</span>
                            </div>
                          </td>
                          {/* Porte */}
                          <td className="py-2.5 px-3">
                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{lead.funcionarios_estimados || 0}+</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>func.</p>
                          </td>
                          {/* Website */}
                          <td className="py-2.5 px-3">
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-1 hover:underline"
                                style={{ color: '#0A66C2' }}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                              </a>
                            ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                          {/* Decisor */}
                          <td className="py-2.5 px-3">
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{lead.decisor_nome}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{lead.decisor_cargo}</p>
                          </td>
                          {/* LinkedIn icon */}
                          <td className="py-2.5 px-3 text-center">
                            {lead.linkedin_url ? (
                              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-[#0A66C220]" title="Ver LinkedIn">
                                <Link2 className="h-3.5 w-3.5" style={{ color: '#0A66C2' }} />
                              </a>
                            ) : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                          </td>
                          {/* Email icon */}
                          <td className="py-2.5 px-3 text-center">
                            {lead.email ? (
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded" title={lead.email}>
                                <Mail className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
                              </span>
                            ) : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                          </td>
                          {/* Status pill */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: `${statusMeta.color}15`, color: statusMeta.color, border: `1px solid ${statusMeta.color}30` }}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={12} className="p-0">
                              <LeadDetailPanel lead={lead} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
