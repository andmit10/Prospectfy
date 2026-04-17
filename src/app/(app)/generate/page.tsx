import { LeadGenerator } from '@/components/generate/lead-generator'
import { Sparkles, Zap, Target, TrendingUp, ArrowUpRight } from 'lucide-react'

export const metadata = { title: 'Gerar Leads | convertafy' }

const modules = [
  {
    icon: Zap,
    label: 'Geração com IA',
    desc: 'Claude analisa e qualifica automaticamente',
    hint: 'Em segundos',
  },
  {
    icon: Target,
    label: 'Leads qualificados',
    desc: 'Score calculado por segmento e cargo',
    hint: 'Ranking dinâmico',
  },
  {
    icon: TrendingUp,
    label: 'Importação direta',
    desc: 'Selecione e importe para sua lista',
    hint: '1 clique',
  },
]

export default function GeneratePage() {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto px-1">
      {/* Header */}
      <div className="animate-fade-in-up">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--brand-blue-muted)' }}
          >
            <Sparkles className="h-4 w-4" style={{ color: 'var(--brand-blue)' }} />
          </div>
          <h1
            className="font-display text-2xl font-semibold text-[var(--text-primary)]"
            style={{ letterSpacing: '-0.025em' }}
          >
            Geração de Leads com IA
          </h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
          Configure o segmento e região — o agente vai encontrar, enriquecer e qualificar leads para você.
        </p>
      </div>

      {/* Module cards — 3 col grid on md+ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ icon: Icon, label, desc, hint }, idx) => (
          <article
            key={label}
            className={[
              'group relative overflow-hidden rounded-xl border p-4',
              'border-[var(--border)] bg-[var(--surface-2)] hover-lift shine-on-hover',
              idx === 0 && 'animate-fade-in-up-delay-1',
              idx === 1 && 'animate-fade-in-up-delay-2',
              idx === 2 && 'animate-fade-in-up-delay-3',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* Subtle top gradient accent */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in oklab, var(--brand-blue) 50%, transparent), transparent)',
              }}
            />

            <div className="flex items-start justify-between gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: 'var(--brand-blue-muted)',
                  border: '1px solid color-mix(in oklab, var(--brand-blue) 25%, transparent)',
                }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--brand-blue)' }} />
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color: 'var(--brand-blue)',
                  backgroundColor: 'var(--brand-blue-muted)',
                }}
              >
                {hint}
                <ArrowUpRight className="h-2.5 w-2.5" />
              </span>
            </div>

            <div className="mt-3">
              <h3
                className="font-display text-base font-semibold text-[var(--text-primary)]"
                style={{ letterSpacing: '-0.015em' }}
              >
                {label}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-tertiary)]">
                {desc}
              </p>
            </div>
          </article>
        ))}
      </div>

      {/* Main Generator */}
      <div className="animate-fade-in-up-delay-3">
        <LeadGenerator />
      </div>
    </div>
  )
}
