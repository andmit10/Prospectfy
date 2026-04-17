'use client'

import {
  Star,
  MapPin,
  Briefcase,
  Link2,
  AtSign,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

/**
 * Shared visual primitives between the Lead Generator preview and the
 * persisted /leads table. Keeping them here ensures both screens stay
 * visually consistent.
 */

export const FONTES: ReadonlyArray<{
  id: string
  label: string
  color: string
  icon: LucideIcon
}> = [
  { id: 'google_maps', label: 'Google Maps', color: '#EA4335', icon: MapPin },
  { id: 'quadro_societario', label: 'Quadro societário', color: 'var(--primary)', icon: Briefcase },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: Link2 },
  { id: 'hunter', label: 'Hunter.io', color: '#FF6B35', icon: AtSign },
  { id: 'claude_ai', label: 'Claude AI', color: '#D4A574', icon: Sparkles },
]

export function StarRating({ rating }: { rating: number }) {
  if (!rating || rating <= 0) {
    return <span className="text-xs text-[var(--text-tertiary)]">—</span>
  }
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
      <span className="ml-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {rating.toFixed(1)}
      </span>
    </span>
  )
}

export function SourceBadge({ id }: { id: string }) {
  const src = FONTES.find((f) => f.id === id)
  if (!src) return null
  const Icon = src.icon
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-md"
      title={src.label}
      aria-label={src.label}
      style={{
        backgroundColor: `color-mix(in oklab, ${src.color} 10%, transparent)`,
        border: `1px solid color-mix(in oklab, ${src.color} 25%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3" style={{ color: src.color }} />
    </span>
  )
}

/** Colored 2-digit score badge. Green ≥70 / amber ≥50 / red otherwise. */
export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--primary)' : score >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <span
      className="inline-flex h-6 min-w-8 items-center justify-center rounded px-1.5 text-xs font-bold"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
        color,
      }}
    >
      {score}
    </span>
  )
}

/**
 * Safe typed accessor for the jsonb `metadata` column on leads.
 * Falls back to empty object so callers can chain `.field` safely.
 */
export type LeadMetadata = {
  cnpj_ativo?: boolean
  rating_maps?: number
  total_avaliacoes?: number
  porte?: string | null
  funcionarios_estimados?: number
  score_detalhes?: {
    maps_presenca: number
    decisor_encontrado: number
    email_validado: number
    linkedin_ativo: number
    porte_match: number
  } | null
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cep?: string | null
  endereco_completo?: string | null
  razao_social?: string | null
  nome_fantasia?: string | null
  data_abertura?: string | null
  capital_social?: number | null
  natureza_juridica?: string | null
  situacao_cnpj?: string | null
  inscricao_estadual?: string | null
  opcao_simples?: boolean | null
  opcao_mei?: boolean | null
  tipo?: 'Matriz' | 'Filial' | null
  website?: string | null
  telefones_extras?: string[]
  fontes_consultadas?: string[]
}

export function getMeta(raw: unknown): LeadMetadata {
  return (raw ?? {}) as LeadMetadata
}

/**
 * Derive active sources from metadata. When explicit `fontes_consultadas`
 * is stored, use it; otherwise infer from available fields (same heuristic
 * as the generator preview).
 */
export function deriveFontesAtivas(meta: LeadMetadata, lead: { linkedin_url: string | null; email: string | null }): string[] {
  if (meta.fontes_consultadas && meta.fontes_consultadas.length > 0) {
    return meta.fontes_consultadas
  }
  const inferred: string[] = ['google_maps', 'quadro_societario']
  if (lead.linkedin_url) inferred.push('linkedin')
  if (lead.email) inferred.push('hunter')
  inferred.push('claude_ai')
  return inferred
}
