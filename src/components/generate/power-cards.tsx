'use client'

import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import {
  Zap,
  Target,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'

/**
 * Power cards on the Generate page. Instead of static labels, each card rotates
 * through AI-flavored insights. Behavior adapts to the org's current state:
 *
 *  - **Empty state** (no leads yet): aspirational insights focused on what the
 *    user can achieve (acquisition-driven messaging).
 *  - **With data**: real-time insights derived from pipeline + activity metrics
 *    (retention-driven messaging).
 *
 * Visual language intentionally more elevated than the rest of the page — this
 * is the marketing surface inside the app.
 */

type Insight = {
  headline: string
  detail: string
  pill: string
}

type CardDef = {
  key: string
  icon: LucideIcon
  title: string
  /** Gradient hue stops — drives glow + border highlight. */
  hue: { from: string; to: string; solid: string }
  emptyInsights: Insight[]
  withDataInsights: (m: Metrics) => Insight[]
  /** Visual accessory rendered under the insight. */
  viz: 'spark' | 'ring' | 'bars'
}

type Metrics = {
  leadsActive: number
  sentLast30: number
  repliedLast30: number
  meetingsLast30: number
  pipeline: Record<string, number>
}

const CARDS: CardDef[] = [
  {
    key: 'generation',
    icon: Zap,
    title: 'Geração com IA',
    hue: { from: '#8B5CF6', to: '#A855F7', solid: '#8B5CF6' },
    viz: 'spark',
    emptyInsights: [
      {
        headline: 'Encontre 500 leads do seu ICP',
        detail: 'Descreva em português. A IA acha empresas e decisores.',
        pill: 'Em segundos',
      },
      {
        headline: 'Prospecte sem queimar SDR',
        detail: 'Claude Sonnet 4 faz o scraping e o enriquecimento por você.',
        pill: 'Zero esforço',
      },
      {
        headline: 'ICP hiper-específico',
        detail: '“Heads de RH em SaaS B2B 50–200 func. em SP” — e pronto.',
        pill: 'Prompt livre',
      },
    ],
    withDataInsights: (m) => [
      {
        headline: `${m.leadsActive.toLocaleString('pt-BR')} leads ativos`,
        detail: 'Gere mais 200 no mesmo ICP para manter o funil cheio.',
        pill: 'Sugestão IA',
      },
      {
        headline: 'Seu funil está aquecendo',
        detail: `${m.sentLast30} mensagens em 30 dias — escale 2× com mais leads.`,
        pill: 'Crescimento',
      },
      {
        headline: 'Hora de diversificar',
        detail: 'Rode um novo ICP adjacente e compare a taxa de resposta.',
        pill: 'Experimento',
      },
    ],
  },
  {
    key: 'qualification',
    icon: Target,
    title: 'Leads qualificados',
    hue: { from: '#10B981', to: '#059669', solid: '#10B981' },
    viz: 'ring',
    emptyInsights: [
      {
        headline: 'Score por fit automático',
        detail: 'Cargo + segmento + tamanho → prioridade calculada.',
        pill: 'Ranking dinâmico',
      },
      {
        headline: 'Você só fala com quem importa',
        detail: 'Decisores aparecem no topo. O resto espera.',
        pill: 'Economiza tempo',
      },
      {
        headline: 'Qualificação via BANT',
        detail: 'Agente de qualificação aplica BANT no WhatsApp sem fricção.',
        pill: 'Agente IA',
      },
    ],
    withDataInsights: (m) => {
      const hot = (m.pipeline['respondeu'] ?? 0) + (m.pipeline['reuniao'] ?? 0)
      const replyRate =
        m.sentLast30 > 0 ? Math.round((m.repliedLast30 / m.sentLast30) * 100) : 0
      return [
        {
          headline: `${hot} leads quentes agora`,
          detail: 'Responderam ou têm reunião marcada — priorize hoje.',
          pill: 'Prioridade',
        },
        {
          headline: `${replyRate}% de taxa de resposta`,
          detail:
            replyRate >= 20
              ? 'Acima da média de mercado. Dobre o volume com segurança.'
              : 'Ajuste o 1º toque para subir acima de 20%.',
          pill: replyRate >= 20 ? 'Você está bem' : 'Oportunidade',
        },
        {
          headline: 'Score médio segurando',
          detail: 'IA está filtrando o que importa. Siga importando em massa.',
          pill: 'Saúde do funil',
        },
      ]
    },
  },
  {
    key: 'import',
    icon: TrendingUp,
    title: 'Importação direta',
    hue: { from: '#3B82F6', to: '#2563EB', solid: '#3B82F6' },
    viz: 'bars',
    emptyInsights: [
      {
        headline: 'Do CSV à campanha em 1 clique',
        detail: 'Arraste o arquivo. A IA mapeia colunas sozinha.',
        pill: '1 clique',
      },
      {
        headline: 'Dedupe automático',
        detail: 'Sem lead repetido, sem WhatsApp inválido na sua base.',
        pill: 'Base limpa',
      },
      {
        headline: 'Comece hoje, reuna amanhã',
        detail: '500 leads importados = primeira reunião em 24h.',
        pill: 'Ritmo rápido',
      },
    ],
    withDataInsights: (m) => [
      {
        headline: `${m.meetingsLast30} reuniões em 30 dias`,
        detail: 'Importe mais 1.000 leads para dobrar esse número.',
        pill: 'Multiplicador',
      },
      {
        headline: 'Pronto pra escalar',
        detail: 'Seu pipeline aguenta +50%. Suba uma lista nova agora.',
        pill: 'Capacidade',
      },
      {
        headline: 'Integre seu CRM',
        detail: 'Conecte HubSpot/Pipedrive e puxe leads sem copiar CSV.',
        pill: 'Integração',
      },
    ],
  },
]

function useRotatingIndex(length: number, intervalMs: number, offset = 0) {
  const [i, setI] = useState(offset % length)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % length), intervalMs)
    return () => clearInterval(t)
  }, [length, intervalMs])
  return i
}

export function PowerCards() {
  const { data: metrics } = trpc.dashboard.metrics.useQuery(undefined, {
    staleTime: 30_000,
  })
  const hasData = (metrics?.leadsActive ?? 0) > 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map((card, idx) => (
        <PowerCard
          key={card.key}
          card={card}
          index={idx}
          hasData={hasData}
          metrics={metrics as Metrics | undefined}
        />
      ))}
    </div>
  )
}

function PowerCard({
  card,
  index,
  hasData,
  metrics,
}: {
  card: CardDef
  index: number
  hasData: boolean
  metrics: Metrics | undefined
}) {
  const insights = useMemo(() => {
    if (hasData && metrics) return card.withDataInsights(metrics)
    return card.emptyInsights
  }, [card, hasData, metrics])

  // Stagger rotation so the cards don't flip in sync.
  const active = useRotatingIndex(insights.length, 5200, index)
  const current = insights[active]
  const Icon = card.icon

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-2xl p-[1px]',
        'animate-fade-in-up',
        index === 0
          ? 'animate-fade-in-up-delay-1'
          : index === 1
          ? 'animate-fade-in-up-delay-2'
          : 'animate-fade-in-up-delay-3',
      ].join(' ')}
      style={{
        background: `linear-gradient(135deg, ${card.hue.from}55, transparent 40%, ${card.hue.to}30 100%)`,
      }}
    >
      {/* Inner card body */}
      <div
        className="relative h-full overflow-hidden rounded-[15px] p-5"
        style={{
          background:
            'linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)',
        }}
      >
        {/* Ambient glow — sits behind content */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
          style={{ background: card.hue.solid }}
        />
        {/* Shimmer sweep on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
        {/* Grid pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            color: 'var(--text-primary)',
            maskImage:
              'radial-gradient(ellipse 60% 60% at 20% 0%, black 30%, transparent 70%)',
          }}
        />

        {/* HEAD — icon + AI pulsing badge */}
        <div className="relative flex items-start justify-between gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]"
            style={{
              background: `linear-gradient(135deg, ${card.hue.from}, ${card.hue.to})`,
              boxShadow: `0 8px 24px ${card.hue.solid}40`,
            }}
          >
            <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>

          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${card.hue.solid}40`,
              background: `${card.hue.solid}14`,
              color: card.hue.solid,
            }}
          >
            <Sparkles className="h-2.5 w-2.5" />
            <span>{hasData ? 'Insight IA' : 'Potencial'}</span>
            <span
              className="animate-pulse-dot h-1 w-1 rounded-full"
              style={{ background: card.hue.solid }}
            />
          </div>
        </div>

        {/* STATIC TITLE */}
        <h3
          className="relative mt-4 font-display text-lg font-semibold text-[var(--text-primary)]"
          style={{ letterSpacing: '-0.02em' }}
        >
          {card.title}
        </h3>

        {/* ROTATING INSIGHT */}
        <div className="relative mt-3 min-h-[76px]">
          <div key={active} className="insight-rotate">
            <p
              className="font-display text-[15px] font-semibold leading-snug"
              style={{
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {current.headline}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-tertiary)]">
              {current.detail}
            </p>
          </div>
        </div>

        {/* FOOTER — pill + viz */}
        <div className="relative mt-4 flex items-center justify-between gap-3">
          <span
            key={`pill-${active}`}
            className="insight-rotate inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: `${card.hue.solid}18`,
              color: card.hue.solid,
              border: `1px solid ${card.hue.solid}30`,
            }}
          >
            {current.pill}
            <ArrowUpRight className="h-3 w-3" />
          </span>

          <Viz kind={card.viz} color={card.hue.solid} />
        </div>

        {/* Dot indicators for rotation */}
        <div className="relative mt-3 flex items-center gap-1.5">
          {insights.map((_, i) => (
            <span
              key={i}
              className="h-[3px] flex-1 rounded-full transition-all duration-300"
              style={{
                background:
                  i === active
                    ? card.hue.solid
                    : 'color-mix(in oklab, var(--text-tertiary) 25%, transparent)',
                opacity: i === active ? 0.9 : 0.35,
              }}
            />
          ))}
        </div>
      </div>

      {/* Component-scoped styles */}
      <style jsx>{`
        @keyframes insight-in {
          0% {
            opacity: 0;
            transform: translateY(6px);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }
        .insight-rotate {
          animation: insight-in 480ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
      `}</style>
    </article>
  )
}

/* ─────────────────────────── Viz primitives ────────────────────────── */

function Viz({ kind, color }: { kind: CardDef['viz']; color: string }) {
  if (kind === 'spark') return <Sparkline color={color} />
  if (kind === 'ring') return <Ring color={color} />
  return <Bars color={color} />
}

function Sparkline({ color }: { color: string }) {
  // Deterministic but visually organic.
  const points = [8, 14, 10, 18, 12, 22, 16, 26, 20, 32]
  const w = 80
  const h = 28
  const max = Math.max(...points)
  const step = w / (points.length - 1)
  const path = points
    .map((v, i) => {
      const x = i * step
      const y = h - (v / max) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${w},${h} L0,${h} Z`}
        fill={`url(#sg-${color.slice(1)})`}
      />
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <circle
        cx={(points.length - 1) * step}
        cy={h - (points[points.length - 1] / max) * h}
        r={2.5}
        fill={color}
      >
        <animate attributeName="r" values="2.5;4;2.5" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function Ring({ color }: { color: string }) {
  const pct = 0.72
  const r = 12
  const c = 2 * Math.PI * r
  return (
    <svg width={30} height={30} viewBox="0 0 30 30">
      <circle
        cx={15}
        cy={15}
        r={r}
        fill="none"
        stroke="color-mix(in oklab, currentColor 20%, transparent)"
        strokeWidth={3}
        style={{ color }}
      />
      <circle
        cx={15}
        cy={15}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 15 15)"
      />
      <text
        x={15}
        y={17.5}
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill={color}
      >
        72
      </text>
    </svg>
  )
}

function Bars({ color }: { color: string }) {
  const heights = [40, 68, 52, 82, 96]
  return (
    <div className="flex items-end gap-1" style={{ height: 28 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: `${h}%`,
            background: `linear-gradient(180deg, ${color} 0%, ${color}55 100%)`,
            animation: `barPulse 1.8s ease-in-out ${i * 120}ms infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes barPulse {
          0%, 100% { transform: scaleY(1); opacity: 0.9; }
          50% { transform: scaleY(0.72); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
