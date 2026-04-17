import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kbd } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Palette,
  Users,
  TrendingUp,
  Megaphone,
  Bot,
  Inbox,
  Plus,
  Sparkles,
} from 'lucide-react'

export const metadata = { title: 'Design System | Prospectfy' }

export default function DesignSystemPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <PageHeader
        icon={Palette}
        title="Design System"
        description="Tokens, componentes e padrões visuais do Prospectfy"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Design System' },
        ]}
        badge={
          <Badge className="bg-[var(--primary)] text-[var(--primary-foreground)]">
            v1.0
          </Badge>
        }
        actions={
          <Button>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo token
          </Button>
        }
      />

      {/* ── Typography ── */}
      <Section title="Typography" subtitle="Hierarquia tipográfica">
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          <h1 className="text-4xl font-bold tracking-tight text-gradient-primary">
            Prospectfy — prospecção inteligente
          </h1>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Heading 2 — títulos de seção
          </h2>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            Heading 3 — subtítulos
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Corpo de texto — informação principal em tom secundário para leitura confortável.
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Small — metadados, labels, timestamps
          </p>
        </div>
      </Section>

      {/* ── Surface Layers ── */}
      <Section title="Surface Layers" subtitle="Sistema de elevação (4 camadas)">
        <div className="grid grid-cols-4 gap-3">
          {[
            { name: 'surface-0', label: 'Page', bg: 'var(--surface-0)' },
            { name: 'surface-1', label: 'Sidebar', bg: 'var(--surface-1)' },
            { name: 'surface-2', label: 'Card', bg: 'var(--surface-2)' },
            { name: 'surface-3', label: 'Elevated', bg: 'var(--surface-3)' },
          ].map((s) => (
            <div
              key={s.name}
              className="rounded-xl p-4 h-24 flex flex-col justify-between border border-[var(--border)]"
              style={{ backgroundColor: s.bg }}
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
                {s.name}
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">{s.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Semantic Colors ── */}
      <Section title="Status semânticos" subtitle="Cores para estados">
        <div className="grid grid-cols-4 gap-3">
          {[
            { name: 'success', color: 'var(--success)', bg: 'var(--success-muted)' },
            { name: 'warning', color: 'var(--warning)', bg: 'var(--warning-muted)' },
            { name: 'info', color: 'var(--info)', bg: 'var(--info-muted)' },
            { name: 'danger', color: 'var(--danger)', bg: 'var(--danger-muted)' },
          ].map((c) => (
            <div
              key={c.name}
              className="rounded-xl p-4 border"
              style={{ backgroundColor: c.bg, borderColor: `color-mix(in oklab, ${c.color} 30%, transparent)` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: c.color }}>
                  {c.name}
                </span>
              </div>
              <code className="text-[10px] font-mono text-[var(--text-tertiary)]">
                --{c.name}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── StatCards ── */}
      <Section title="StatCard" subtitle="Cartão de métrica unificado">
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Leads ativos"
            value={1284}
            sub="+12 hoje"
            icon={Users}
            variant="info"
            trend={{ value: 12.5 }}
          />
          <StatCard
            label="Taxa de resposta"
            value="28.4%"
            sub="últimos 30 dias"
            icon={TrendingUp}
            variant="success"
            trend={{ value: 3.2 }}
          />
          <StatCard
            label="Campanhas"
            value={7}
            sub="3 pausadas"
            icon={Megaphone}
            variant="warning"
            trend={{ value: -2.1 }}
          />
          <StatCard
            label="Agente IA"
            value="Ativo"
            sub="142 jobs hoje"
            icon={Bot}
            variant="success"
          />
        </div>
      </Section>

      {/* ── Buttons & Badges ── */}
      <Section title="Ações e Badges" subtitle="Buttons + Badges">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Gerar com IA
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            Atalhos: <Kbd>⌘K</Kbd> <Kbd>⇧</Kbd> <Kbd>Esc</Kbd>
          </div>
        </div>
      </Section>

      {/* ── Empty State ── */}
      <Section title="Empty State" subtitle="Estados vazios consistentes">
        <EmptyState
          icon={Inbox}
          title="Nenhum lead encontrado"
          description="Importe um CSV, gere com IA ou adicione manualmente para começar a prospectar."
          action={
            <div className="flex gap-2">
              <Button>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Gerar leads com IA
              </Button>
              <Button variant="outline">Importar CSV</Button>
            </div>
          }
        />
      </Section>

      {/* ── Animations ── */}
      <Section title="Micro-interações" subtitle="Shimmer, fade-in, pulse-dot, hover-glow">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="" value="" loading />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 hover-glow cursor-pointer flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-[var(--primary)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--primary)]" />
            </span>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Agente ativo</p>
              <p className="text-xs text-[var(--text-tertiary)]">Hover-glow + pulse-dot</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}
