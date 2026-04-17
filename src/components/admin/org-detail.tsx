'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Building2,
  Users,
  Zap,
  DollarSign,
  Database,
  MessageCircle,
  Edit,
  Save,
  X,
  KeyRound,
  UserMinus,
  UserCheck,
  Copy,
  ExternalLink,
  Loader2,
  PauseCircle,
  PlayCircle,
  Shield,
  Coins,
  Plus,
  Minus,
  CreditCard,
  FileText,
  Receipt,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

const PLAN_OPTIONS = [
  'trial',
  'starter',
  'pro',
  'business',
  'agency',
  'enterprise',
] as const

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  org_admin: 'Admin',
  member: 'Membro',
  viewer: 'Leitor',
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n)
}

export function OrgDetail({ orgId }: { orgId: string }) {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.admin.getOrg.useQuery({ id: orgId })
  const [editing, setEditing] = useState(false)

  const suspend = trpc.admin.suspendOrg.useMutation({
    onSuccess: () => {
      toast.success('Organização suspensa')
      utils.admin.getOrg.invalidate({ id: orgId })
      utils.admin.listOrgs.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })
  const resume = trpc.admin.resumeOrg.useMutation({
    onSuccess: () => {
      toast.success('Organização reativada')
      utils.admin.getOrg.invalidate({ id: orgId })
      utils.admin.listOrgs.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })
  const impersonate = trpc.admin.beginImpersonation.useMutation({
    onSuccess: () => {
      toast.success('Sessão de impersonation aberta')
      router.push('/dashboard')
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando organização...
      </div>
    )
  }

  const org = data.org as Record<string, unknown>
  const suspended = !!org.suspended_at

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-3 w-3" />
        Voltar à lista
      </Link>

      {/* Header */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
                color: 'var(--primary)',
              }}
            >
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">
                {org.name as string}
              </h1>
              <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
                {org.slug as string} · plano{' '}
                <strong className="font-semibold">{org.plan as string}</strong> ·{' '}
                {suspended ? (
                  <span className="text-amber-600">suspensa desde {new Date(org.suspended_at as string).toLocaleDateString('pt-BR')}</span>
                ) : (
                  <span className="text-emerald-600">ativa</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const reason = prompt(
                  `Por que impersonar "${org.name}"? (mín. 10 caracteres)`
                )
                if (!reason || reason.length < 10) return
                impersonate.mutate({ targetOrgId: orgId, reason })
              }}
            >
              <UserCheck className="mr-1 h-3.5 w-3.5" />
              Impersonar
            </Button>
            {suspended ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resume.mutate({ id: orgId })}
                disabled={resume.isPending}
              >
                <PlayCircle className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                Reativar
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const reason = prompt('Motivo da suspensão:')
                  if (!reason || reason.length < 5) return
                  suspend.mutate({ id: orgId, reason })
                }}
                disabled={suspend.isPending}
              >
                <Shield className="mr-1 h-3.5 w-3.5 text-amber-600" />
                Suspender
              </Button>
            )}
            {!editing && (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Edit className="mr-1 h-3.5 w-3.5" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Editor inline */}
      {editing && (
        <OrgEditForm
          key={`${org.id}:${org.name}:${org.slug}:${org.plan}`}
          org={org}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            utils.admin.getOrg.invalidate({ id: orgId })
            utils.admin.listOrgs.invalidate()
          }}
        />
      )}

      {/* Usage stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} color="#10B981" label="Leads" value={data.stats.leads.toString()} />
        <StatCard
          icon={Zap}
          color="#F59E0B"
          label="Execuções (30d)"
          value={data.stats.runsLast30.toString()}
          sub={
            data.stats.runsLast30 > 0
              ? `${Math.round((data.stats.runsSuccess / data.stats.runsLast30) * 100)}% sucesso`
              : undefined
          }
        />
        <StatCard
          icon={MessageCircle}
          color="#3B82F6"
          label="Mensagens (30d)"
          value={data.stats.messagesLast30.toString()}
        />
        <StatCard
          icon={Database}
          color="#A855F7"
          label="Knowledge Bases"
          value={data.stats.knowledgeBases.toString()}
        />
        <StatCard
          icon={DollarSign}
          color="#F97316"
          label="Tokens IA (30d)"
          value={(data.stats.tokensLast30 / 1000).toFixed(1) + 'k'}
          sub={`$${data.stats.costUsdLast30.toFixed(2)} em custo`}
        />
      </div>

      {/* Revenue */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-semibold">Receita mensal</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <RevenueRow label="MRR total" value={formatBrl(data.revenue.mrr)} emphasis />
          <RevenueRow label="Plano base" value={formatBrl(data.revenue.planPrice)} />
          <RevenueRow label="Add-ons ativos" value={formatBrl(data.revenue.addonPrice)} />
          <RevenueRow
            label="Ticket médio por usuário"
            value={formatBrl(data.revenue.ticketMedio)}
          />
          <RevenueRow
            label="Custo IA últimos 30d"
            value={`$${data.stats.costUsdLast30.toFixed(2)}`}
          />
          <RevenueRow
            label="Margem sobre IA"
            value={
              data.stats.costUsdLast30 > 0 && data.revenue.mrr > 0
                ? `${(((data.revenue.mrr / 5) - data.stats.costUsdLast30) / (data.revenue.mrr / 5) * 100).toFixed(0)}%`
                : '—'
            }
          />
        </div>
      </div>

      {/* Registry / Dados cadastrais */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <h2 className="mb-3 text-sm font-semibold">Dados cadastrais</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
          <DtDd label="ID" value={<code className="font-mono text-xs">{org.id as string}</code>} />
          <DtDd label="Slug" value={org.slug as string} />
          <DtDd label="Plano" value={org.plan as string} />
          <DtDd label="Email de cobrança" value={(org.billing_email as string) ?? '—'} />
          <DtDd
            label="Criada em"
            value={new Date(org.created_at as string).toLocaleString('pt-BR')}
          />
          <DtDd
            label="Trial termina"
            value={
              org.trial_ends_at
                ? new Date(org.trial_ends_at as string).toLocaleDateString('pt-BR')
                : '—'
            }
          />
          <DtDd
            label="Stripe customer"
            value={(org.stripe_customer_id as string) ?? '—'}
            mono
          />
          <DtDd
            label="Stripe subscription"
            value={(org.stripe_subscription_id as string) ?? '—'}
            mono
          />
          <DtDd
            label="Última atualização"
            value={new Date(org.updated_at as string).toLocaleString('pt-BR')}
          />
        </dl>
      </div>

      {/* Members */}
      <MembersSection
        orgId={orgId}
        members={data.members}
        onChanged={() => utils.admin.getOrg.invalidate({ id: orgId })}
      />

      {/* Add-ons */}
      {data.addons.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
        >
          <h2 className="mb-3 text-sm font-semibold">Add-ons ativos</h2>
          <div className="space-y-2">
            {data.addons.map((a) => (
              <div
                key={(a as { id: string }).id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span>
                  <strong>{(a as { display_name: string }).display_name}</strong>
                  <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                    qty {(a as { quantity: number }).quantity}
                  </span>
                </span>
                <span>
                  {formatBrl(
                    Number((a as { monthly_price_brl: number }).monthly_price_brl) *
                      Number((a as { quantity: number }).quantity)
                  )}{' '}
                  / mês
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Credit adjustments */}
      <CreditsSection
        orgId={orgId}
        credits={data.credits as CreditEntry[]}
        onChanged={() => utils.admin.getOrg.invalidate({ id: orgId })}
      />

      {/* Stripe payments */}
      <PaymentsSection orgId={orgId} />

      {/* Audit log */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
      >
        <h2 className="mb-3 text-sm font-semibold">Audit log — últimas 50 ações</h2>
        {data.audit.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Sem atividade ainda.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.audit.map((a) => {
              const row = a as {
                id: string
                action: string
                target_type: string | null
                created_at: string
              }
              return (
                <li key={row.id} className="flex items-center gap-2">
                  <span className="text-[var(--text-tertiary)]">
                    {new Date(row.created_at).toLocaleString('pt-BR')}
                  </span>
                  <span>·</span>
                  <span className="font-mono">{row.action}</span>
                  {row.target_type && (
                    <span className="text-[var(--text-tertiary)]">({row.target_type})</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  color = 'var(--primary)',
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  color?: string
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
          color,
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p
          className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </p>
        <p
          className="text-lg font-semibold"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </p>
        {sub && <p className="text-[11px] text-[var(--text-tertiary)]">{sub}</p>}
      </div>
    </div>
  )
}

function RevenueRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-tertiary)]">{label}</p>
      <p className={`text-${emphasis ? 'xl' : 'base'} font-semibold`}>{value}</p>
    </div>
  )
}

function DtDd({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className={`truncate ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</dd>
    </div>
  )
}

function OrgEditForm({
  org,
  onClose,
  onSaved,
}: {
  org: Record<string, unknown>
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState((org.name as string) ?? '')
  const [slug, setSlug] = useState((org.slug as string) ?? '')
  const [billingEmail, setBillingEmail] = useState((org.billing_email as string) ?? '')
  const [plan, setPlan] = useState<string>((org.plan as string) ?? 'trial')

  const update = trpc.admin.updateOrg.useMutation({
    onSuccess: () => {
      toast.success('Organização atualizada')
      onSaved()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: 'var(--primary)',
        backgroundColor: 'color-mix(in oklab, var(--primary) 3%, var(--surface-1))',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Editar organização</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Nome
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Slug
          </label>
          <Input
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Email de cobrança
          </label>
          <Input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Plano
          </label>
          <Select value={plan} onValueChange={(v) => v && setPlan(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={() =>
            update.mutate({
              id: org.id as string,
              name,
              slug,
              billing_email: billingEmail,
              plan: plan as 'trial' | 'starter' | 'pro' | 'business' | 'agency' | 'enterprise',
            })
          }
          disabled={update.isPending || name.length < 2}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}

type Member = {
  userId: string
  role: string
  joinedAt: string
  invitedAt: string | null
  fullName: string | null
  avatarUrl: string | null
  email: string | null
  lastSignInAt: string | null
}

function MembersSection({
  orgId,
  members,
  onChanged,
}: {
  orgId: string
  members: Member[]
  onChanged: () => void
}) {
  const reset = trpc.admin.sendPasswordReset.useMutation({
    onSuccess: (data) => {
      toast.success(`Email de recuperação enviado para ${data.email}`)
      if (data.actionLink) {
        // Copy to clipboard for convenience when email isn't configured.
        navigator.clipboard?.writeText(data.actionLink).catch(() => null)
        toast.info('Link copiado para a área de transferência (caso o email não chegue)')
      }
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const remove = trpc.admin.removeOrgMember.useMutation({
    onSuccess: () => {
      toast.success('Membro removido')
      onChanged()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const changeRole = trpc.admin.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success('Role atualizada')
      onChanged()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Membros ({members.length})</h2>
      </div>

      {members.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Nenhum membro nessa organização.</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {members.map((m) => {
            const initials = (m.fullName || m.email || '?')
              .split(/[\s@]/)
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase()
            return (
              <div key={m.userId} className="flex items-center gap-3 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--surface-3)',
                    color: 'var(--primary)',
                  }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.fullName || m.email || m.userId}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                    {m.email && <span>{m.email}</span>}
                    <span>·</span>
                    <span>Entrou em {new Date(m.joinedAt).toLocaleDateString('pt-BR')}</span>
                    {m.lastSignInAt && (
                      <>
                        <span>·</span>
                        <span>
                          Últ. login{' '}
                          {new Date(m.lastSignInAt).toLocaleDateString('pt-BR')}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <Select
                  value={m.role}
                  onValueChange={(v) => {
                    if (!v || v === m.role) return
                    changeRole.mutate({
                      orgId,
                      userId: m.userId,
                      role: v as 'super_admin' | 'org_admin' | 'member' | 'viewer',
                    })
                  }}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">{ROLE_LABEL.org_admin}</SelectItem>
                    <SelectItem value="member">{ROLE_LABEL.member}</SelectItem>
                    <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                    <SelectItem value="super_admin">{ROLE_LABEL.super_admin}</SelectItem>
                  </SelectContent>
                </Select>

                {m.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!confirm(`Enviar email de redefinição de senha para ${m.email}?`))
                        return
                      reset.mutate({ email: m.email!, orgIdForAudit: orgId })
                    }}
                    disabled={reset.isPending}
                    title="Enviar redefinição de senha"
                  >
                    <KeyRound className="mr-1 h-3 w-3" />
                    Reset senha
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (!confirm(`Remover ${m.fullName || m.email} da organização?`))
                      return
                    remove.mutate({ orgId, userId: m.userId })
                  }}
                  disabled={remove.isPending}
                  title="Remover da organização"
                >
                  <UserMinus className="h-3.5 w-3.5 text-[var(--danger)]" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Credit adjustments ─────────────────────────────────────────────────

type CreditEntry = {
  id: string
  delta_credits: number
  reason: string
  created_at: string
  actor_user_id: string | null
}

function CreditsSection({
  orgId,
  credits,
  onChanged,
}: {
  orgId: string
  credits: CreditEntry[]
  onChanged: () => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [sign, setSign] = useState<'add' | 'remove'>('add')

  const adjust = trpc.admin.adjustCredits.useMutation({
    onSuccess: () => {
      toast.success('Créditos ajustados')
      setAmount('')
      setReason('')
      onChanged()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const balance = credits.reduce((sum, c) => sum + Number(c.delta_credits), 0)
  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0 && reason.length >= 5

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: '#F59E0B' }} />
          <h2 className="text-sm font-semibold">Créditos (ajustes manuais)</h2>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor:
              balance >= 0
                ? 'color-mix(in oklab, #10B981 12%, transparent)'
                : 'color-mix(in oklab, #EF4444 12%, transparent)',
            color: balance >= 0 ? '#10B981' : '#EF4444',
          }}
        >
          Saldo: {balance > 0 ? '+' : ''}
          {balance}
        </span>
      </div>

      {/* Adjustment form */}
      <div
        className="mb-4 rounded-lg border p-3"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[auto_100px_1fr_auto]">
          <div className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => setSign('add')}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: sign === 'add' ? 'color-mix(in oklab, #10B981 16%, transparent)' : 'transparent',
                color: sign === 'add' ? '#10B981' : 'var(--text-secondary)',
              }}
            >
              <Plus className="h-3 w-3" />
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => setSign('remove')}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: sign === 'remove' ? 'color-mix(in oklab, #EF4444 16%, transparent)' : 'transparent',
                color: sign === 'remove' ? '#EF4444' : 'var(--text-secondary)',
              }}
            >
              <Minus className="h-3 w-3" />
              Remover
            </button>
          </div>
          <Input
            type="number"
            min={1}
            placeholder="Qtd"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            placeholder="Motivo (mínimo 5 caracteres) — aparece no audit log"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            onClick={() =>
              adjust.mutate({
                orgId,
                delta: sign === 'add' ? Math.abs(parsed) : -Math.abs(parsed),
                reason,
              })
            }
            disabled={!valid || adjust.isPending}
          >
            {adjust.isPending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <Save className="mr-1 h-3.5 w-3.5" />
                Aplicar
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
          Use para cortesia, bônus de campanha ou estorno. Toda ação é registrada no audit log com
          quem aplicou.
        </p>
      </div>

      {/* History */}
      {credits.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Nenhum ajuste aplicado ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {credits.slice(0, 20).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor:
                      c.delta_credits > 0
                        ? 'color-mix(in oklab, #10B981 14%, transparent)'
                        : 'color-mix(in oklab, #EF4444 14%, transparent)',
                    color: c.delta_credits > 0 ? '#10B981' : '#EF4444',
                  }}
                >
                  {c.delta_credits > 0 ? (
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                  ) : (
                    <Minus className="h-3 w-3" strokeWidth={2.5} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{c.reason}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {new Date(c.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <span
                className="shrink-0 font-mono text-sm font-semibold"
                style={{ color: c.delta_credits > 0 ? '#10B981' : '#EF4444' }}
              >
                {c.delta_credits > 0 ? '+' : ''}
                {c.delta_credits}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Stripe payments ────────────────────────────────────────────────────

function PaymentsSection({ orgId }: { orgId: string }) {
  const { data, isLoading } = trpc.admin.listOrgPayments.useQuery({ orgId })

  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" style={{ color: '#635BFF' }} />
          <h2 className="text-sm font-semibold">Histórico de pagamentos (Stripe)</h2>
        </div>
        {data?.customerId && (
          <a
            href={`https://dashboard.stripe.com/customers/${data.customerId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Ver no Stripe
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {isLoading ? (
        <div className="py-4 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Carregando pagamentos...
        </div>
      ) : !data?.configured ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          Stripe não configurado. Defina{' '}
          <code className="font-mono text-[11px]">STRIPE_SECRET_KEY</code> no ambiente para habilitar.
        </p>
      ) : !data.customerId ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          Esta organização ainda não tem customer_id no Stripe (nenhuma tentativa de checkout).
        </p>
      ) : data.invoices.length === 0 && data.charges.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">Nenhum pagamento ou fatura encontrado.</p>
      ) : (
        <div className="space-y-4">
          {data.invoices.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Faturas ({data.invoices.length})
              </p>
              <ul className="divide-y divide-[var(--border)]">
                {data.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 py-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${
                          inv.status === 'paid' ? '#10B981' : '#F59E0B'
                        } 14%, transparent)`,
                        color: inv.status === 'paid' ? '#10B981' : '#F59E0B',
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold">{inv.number ?? inv.id}</span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{
                            backgroundColor:
                              inv.status === 'paid'
                                ? 'color-mix(in oklab, #10B981 14%, transparent)'
                                : 'color-mix(in oklab, #F59E0B 14%, transparent)',
                            color: inv.status === 'paid' ? '#10B981' : '#F59E0B',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {inv.status}
                        </span>
                      </p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(inv.created * 1000).toLocaleDateString('pt-BR')} · período{' '}
                        {new Date(inv.period_start * 1000).toLocaleDateString('pt-BR')} –{' '}
                        {new Date(inv.period_end * 1000).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {(inv.amount_paid / 100).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: inv.currency.toUpperCase(),
                      })}
                    </span>
                    {inv.hosted_invoice_url && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        Ver fatura
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.charges.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Cobranças ({data.charges.length})
              </p>
              <ul className="divide-y divide-[var(--border)]">
                {data.charges.map((ch) => {
                  const ok = ch.paid && !ch.refunded && ch.status === 'succeeded'
                  return (
                    <li key={ch.id} className="flex items-center gap-3 py-2">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${
                            ok ? '#10B981' : '#EF4444'
                          } 14%, transparent)`,
                          color: ok ? '#10B981' : '#EF4444',
                        }}
                      >
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold">{ch.id}</span>
                          {ch.refunded && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                              style={{
                                backgroundColor: 'color-mix(in oklab, #64748B 14%, transparent)',
                                color: '#64748B',
                                letterSpacing: '0.06em',
                              }}
                            >
                              refunded
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          {new Date(ch.created * 1000).toLocaleString('pt-BR')}
                          {ch.payment_method_details ? ` · ${ch.payment_method_details}` : ''}
                          {ch.failure_message ? ` · ${ch.failure_message}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {(ch.amount / 100).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: ch.currency.toUpperCase(),
                        })}
                      </span>
                      {ch.receipt_url && (
                        <a
                          href={ch.receipt_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          style={{ borderColor: 'var(--border)' }}
                          title="Recibo"
                        >
                          <Receipt className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Unused icons — imported for future expansion, silenced for lint.
void Copy
void PauseCircle
