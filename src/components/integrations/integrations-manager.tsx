'use client'

import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  MessageCircle,
  Mail,
  Briefcase,
  Camera,
  Plus,
  Check,
  X,
  Loader2,
  Star,
  Trash2,
  Send,
  AlertTriangle,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { EvolutionGoQrDialog } from './evolution-go-qr-dialog'

type Channel = 'whatsapp' | 'email' | 'linkedin' | 'instagram'

type ProviderFieldSpec = {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'number' | 'email' | 'textarea' | 'checkbox'
  required: boolean
  placeholder?: string
  help?: string
}

type CatalogEntry = {
  id: string
  channel: Channel
  name: string
  description: string
  risk?: string
  priceNote?: string
  fields: ProviderFieldSpec[]
  hasWebhook: boolean
  webhookPath?: string
  preview?: boolean
}

type Integration = {
  id: string
  channel: Channel
  provider: string
  displayName: string
  config: Record<string, unknown>
  status: 'active' | 'error' | 'disconnected'
  lastError: string | null
  lastErrorAt: string | null
  consecutiveFailures: number
  isDefault: boolean
  connectedAt: string | null
  createdAt: string
  updatedAt: string
}

const CHANNEL_META: Record<
  Channel,
  { label: string; icon: LucideIcon; color: string; tagline: string }
> = {
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    color: '#25D366',
    tagline: 'Canal principal para PMEs brasileiras',
  },
  email: {
    label: 'Email',
    icon: Mail,
    color: '#3B82F6',
    tagline: 'Deliverability + automação em escala',
  },
  linkedin: {
    label: 'LinkedIn',
    icon: Briefcase,
    color: '#0A66C2',
    tagline: 'Outreach B2B via DMs e convites',
  },
  instagram: {
    label: 'Instagram',
    icon: Camera,
    color: '#E1306C',
    tagline: 'DMs via Meta Business (em breve)',
  },
}

export function IntegrationsManager() {
  const { data: catalog, isLoading: catLoading } = trpc.channels.catalog.useQuery()
  const { data: integrations, isLoading: intLoading } = trpc.channels.list.useQuery()
  const [connectTarget, setConnectTarget] = useState<CatalogEntry | null>(null)
  const [testTarget, setTestTarget] = useState<Integration | null>(null)
  const [evoGoQrOpen, setEvoGoQrOpen] = useState(false)

  // Branch the connect flow: evolution_go gets the auto-provision QR dialog
  // (cliente nomeia → cria instância no shared VPS → escaneia QR), everyone
  // else still uses the manual config form.
  function openConnect(entry: CatalogEntry) {
    if (entry.id === 'evolution_go') {
      setEvoGoQrOpen(true)
    } else {
      setConnectTarget(entry)
    }
  }

  const byChannel = useMemo(() => {
    const out: Record<Channel, { catalog: CatalogEntry[]; integrations: Integration[] }> = {
      whatsapp: { catalog: [], integrations: [] },
      email: { catalog: [], integrations: [] },
      linkedin: { catalog: [], integrations: [] },
      instagram: { catalog: [], integrations: [] },
    }
    for (const c of (catalog ?? []) as CatalogEntry[]) {
      if (out[c.channel]) out[c.channel].catalog.push(c)
    }
    for (const i of (integrations ?? []) as Integration[]) {
      if (out[i.channel]) out[i.channel].integrations.push(i)
    }
    return out
  }, [catalog, integrations])

  if (catLoading || intLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    )
  }

  const channels: Channel[] = ['whatsapp', 'email', 'linkedin', 'instagram']

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold text-[var(--text-primary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          Canais & Integrações
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Conecte provedores de cada canal. O agente usa a integração marcada como padrão; fallback
          automático se a primária falhar.
        </p>
      </div>

      {channels.map((ch) => {
        const meta = CHANNEL_META[ch]
        const { catalog: cat, integrations: ints } = byChannel[ch]
        return (
          <ChannelSection
            key={ch}
            meta={meta}
            catalog={cat}
            integrations={ints}
            onConnect={openConnect}
            onTest={setTestTarget}
          />
        )
      })}

      <ConnectDialog
        entry={connectTarget}
        onClose={() => setConnectTarget(null)}
        existingDefault={
          connectTarget
            ? byChannel[connectTarget.channel].integrations.some((i) => i.isDefault)
            : false
        }
      />
      <TestDialog integration={testTarget} onClose={() => setTestTarget(null)} />
      <EvolutionGoQrDialog open={evoGoQrOpen} onClose={() => setEvoGoQrOpen(false)} />
    </div>
  )
}

// ─── Channel section ─────────────────────────────────────────────────────

function ChannelSection({
  meta,
  catalog,
  integrations,
  onConnect,
  onTest,
}: {
  meta: { label: string; icon: LucideIcon; color: string; tagline: string }
  catalog: CatalogEntry[]
  integrations: Integration[]
  onConnect: (entry: CatalogEntry) => void
  onTest: (integration: Integration) => void
}) {
  const { icon: Icon, color, label, tagline } = meta

  return (
    <section
      className="rounded-xl border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
          }}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="text-[15px] font-semibold text-[var(--text-primary)]"
            style={{
              fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            {label}
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">{tagline}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor:
              integrations.length > 0
                ? 'color-mix(in oklab, #10B981 12%, transparent)'
                : 'var(--surface-2)',
            color: integrations.length > 0 ? '#10B981' : 'var(--text-tertiary)',
            letterSpacing: '0.06em',
          }}
        >
          {integrations.length} conectada{integrations.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {integrations.map((i) => (
            <IntegrationRow key={i.id} integration={i} color={color} onTest={onTest} />
          ))}
        </div>
      )}

      {/* Available providers */}
      <div className="p-4">
        <p
          className="mb-2 text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '0.08em',
          }}
        >
          {integrations.length > 0 ? 'Conectar outro provedor' : 'Provedores disponíveis'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.preview}
              onClick={() => !c.preview && onConnect(c)}
              className="group flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:shadow-sm"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className="text-xs font-semibold text-[var(--text-primary)]"
                  style={{
                    fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                  }}
                >
                  {c.name}
                </span>
                {c.preview && (
                  <span
                    className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{
                      backgroundColor: 'color-mix(in oklab, #F59E0B 12%, transparent)',
                      color: '#F59E0B',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Em breve
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                {c.description}
              </p>
              {c.risk && (
                <p className="flex items-start gap-1 text-[10px] text-amber-600">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{c.risk}</span>
                </p>
              )}
              {c.priceNote && (
                <p className="text-[10px] text-[var(--text-tertiary)]">{c.priceNote}</p>
              )}
              {!c.preview && (
                <span
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold transition-colors group-hover:text-[var(--text-primary)]"
                  style={{ color }}
                >
                  <Plus className="h-3 w-3" />
                  Conectar
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Integration row ─────────────────────────────────────────────────────

function IntegrationRow({
  integration,
  color,
  onTest,
}: {
  integration: Integration
  color: string
  onTest: (i: Integration) => void
}) {
  const utils = trpc.useUtils()
  const update = trpc.channels.update.useMutation({
    onSuccess: () => {
      toast.success('Integração atualizada')
      utils.channels.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })
  const del = trpc.channels.delete.useMutation({
    onSuccess: () => {
      toast.success('Integração removida')
      utils.channels.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const statusColor =
    integration.status === 'active'
      ? '#10B981'
      : integration.status === 'error'
        ? '#EF4444'
        : '#64748B'

  return (
    <div className="flex items-center gap-3 p-4">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
          color,
        }}
      >
        {integration.status === 'active' ? (
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {integration.displayName}
          </p>
          {integration.isDefault && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{
                backgroundColor: 'color-mix(in oklab, #F59E0B 14%, transparent)',
                color: '#F59E0B',
                letterSpacing: '0.06em',
              }}
            >
              <Star className="h-2.5 w-2.5" strokeWidth={2.5} />
              Padrão
            </span>
          )}
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
            style={{
              backgroundColor: `color-mix(in oklab, ${statusColor} 12%, transparent)`,
              color: statusColor,
              letterSpacing: '0.06em',
            }}
          >
            {integration.status}
          </span>
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {integration.provider}
          {integration.connectedAt &&
            ` · conectado em ${new Date(integration.connectedAt).toLocaleDateString('pt-BR')}`}
          {integration.consecutiveFailures > 0 &&
            ` · ${integration.consecutiveFailures} falha(s) consecutiva(s)`}
        </p>
        {integration.lastError && (
          <p className="mt-1 line-clamp-1 text-[10px] text-[var(--danger)]">
            Último erro: {integration.lastError}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {!integration.isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update.mutate({ id: integration.id, isDefault: true })}
            disabled={update.isPending}
            title="Tornar padrão"
          >
            <Star className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTest(integration)}
          title="Enviar teste"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!confirm(`Remover integração "${integration.displayName}"?`)) return
            del.mutate({ id: integration.id })
          }}
          disabled={del.isPending}
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
        </Button>
      </div>
    </div>
  )
}

// ─── Connect dialog (dynamic form from catalog) ──────────────────────────

function ConnectDialog({
  entry,
  onClose,
  existingDefault,
}: {
  entry: CatalogEntry | null
  onClose: () => void
  existingDefault: boolean
}) {
  const utils = trpc.useUtils()
  const [displayName, setDisplayName] = useState('')
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [isDefault, setIsDefault] = useState(false)

  const create = trpc.channels.create.useMutation({
    onSuccess: () => {
      toast.success('Integração conectada com sucesso')
      utils.channels.list.invalidate()
      onClose()
      setDisplayName('')
      setValues({})
      setIsDefault(false)
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  // Reset form whenever the user opens a different provider's dialog
  // (without closing in between). The previous in-render check only
  // ran on the very first open and stuck on the first provider's name.
  useEffect(() => {
    if (entry) {
      setDisplayName(entry.name)
      setValues({})
      setIsDefault(!existingDefault)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id])

  if (!entry) return null

  const valid =
    displayName.length >= 2 &&
    entry.fields.filter((f) => f.required).every((f) => {
      const v = values[f.key]
      return typeof v === 'string' ? v.trim().length > 0 : !!v
    })

  const webhookUrl =
    entry.webhookPath &&
    typeof window !== 'undefined' &&
    `${window.location.origin}${entry.webhookPath}`

  return (
    <Dialog
      open={!!entry}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setDisplayName('')
          setValues({})
          setIsDefault(false)
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
              letterSpacing: '-0.01em',
            }}
          >
            Conectar {entry.name}
          </DialogTitle>
          <DialogDescription>{entry.description}</DialogDescription>
        </DialogHeader>

        {entry.risk && (
          <div
            className="flex items-start gap-2 rounded-lg border p-3 text-xs"
            style={{
              borderColor: 'color-mix(in oklab, #F59E0B 30%, var(--border))',
              backgroundColor: 'color-mix(in oklab, #F59E0B 6%, var(--surface-1))',
            }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{entry.risk}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
              Nome interno
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Email principal"
            />
          </div>

          {entry.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                {f.label}
                {f.required && <span className="ml-1 text-[var(--danger)]">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                  className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--surface-1)',
                    color: 'var(--text-primary)',
                  }}
                />
              ) : f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                />
              ) : (
                <Input
                  type={f.type === 'password' ? 'password' : f.type}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
              {f.help && <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{f.help}</p>}
            </div>
          ))}

          {webhookUrl && entry.hasWebhook && (
            <div
              className="rounded-lg border p-3 text-xs"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
            >
              <p className="mb-1 font-semibold text-[var(--text-secondary)]">Webhook URL</p>
              <code className="block overflow-auto rounded bg-[var(--surface-1)] p-2 font-mono text-[10px]">
                {webhookUrl}
              </code>
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                Configure este endpoint no painel do provedor para receber eventos (entrega,
                resposta, erro).
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span>
              Definir como padrão para este canal
              {existingDefault && ' (substitui o atual)'}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              // Clean values: drop empty strings of optional fields
              const config: Record<string, unknown> = {}
              for (const f of entry.fields) {
                const v = values[f.key]
                if (v === undefined || v === '') {
                  if (f.required) return
                  continue
                }
                config[f.key] = v
              }
              create.mutate({
                channel: entry.channel,
                provider: entry.id,
                displayName,
                config,
                isDefault,
              })
            }}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" />
                Conectar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Test-send dialog ────────────────────────────────────────────────────

function TestDialog({
  integration,
  onClose,
}: {
  integration: Integration | null
  onClose: () => void
}) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState(
    'Mensagem de teste do Prospectfy — chegou? Se sim, a integração está funcionando.'
  )

  const send = trpc.channels.sendTest.useMutation({
    onSuccess: () => {
      toast.success('Mensagem de teste enviada')
      onClose()
      setTo('')
      setSubject('')
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  })

  if (!integration) return null
  const isEmail = integration.channel === 'email'

  return (
    <Dialog open={!!integration} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar teste — {integration.displayName}</DialogTitle>
          <DialogDescription>
            Envia uma mensagem real para validar credenciais. Não usa dados de leads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
              {isEmail ? 'Email destinatário' : 'Destinatário'}
            </label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={
                isEmail
                  ? 'voce@empresa.com'
                  : integration.channel === 'whatsapp'
                    ? '5511999999999'
                    : 'identificador'
              }
            />
          </div>
          {isEmail && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Assunto
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Teste Prospectfy"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
              Mensagem
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface-1)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancelar
          </Button>
          <Button
            onClick={() =>
              send.mutate({
                integrationId: integration.id,
                to,
                content,
                subject: isEmail ? subject || undefined : undefined,
              })
            }
            disabled={send.isPending || to.length < 3 || content.length < 3}
          >
            {send.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-1 h-4 w-4" />
                Enviar teste
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
