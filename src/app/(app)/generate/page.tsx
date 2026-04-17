import { LeadGenerator } from '@/components/generate/lead-generator'
import { PowerCards } from '@/components/generate/power-cards'
import { Sparkles } from 'lucide-react'

export const metadata = { title: 'Gerar Leads | convertafy' }

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

      {/* Insight-driven module cards */}
      <PowerCards />

      {/* Main Generator */}
      <div className="animate-fade-in-up-delay-3">
        <LeadGenerator />
      </div>
    </div>
  )
}
