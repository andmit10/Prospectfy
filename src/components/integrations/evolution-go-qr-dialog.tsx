'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react'

/**
 * Evolution Go provisioning dialog — three phases:
 *
 *  1. NAMING   — user picks an instance name + display name. We provision
 *                via tRPC, which creates the instance on the shared VPS,
 *                registers our webhook, and returns the integration UUID.
 *  2. QR       — we poll getWhatsappQR every 2s. As soon as the webhook
 *                receives the `QRCode` event from Evolution Go, the QR base64
 *                lands in metadata and we render it. Refreshes ~every 30s
 *                because WhatsApp rotates the QR.
 *  3. CONNECTED — when status flips to 'active', we celebrate, refetch the
 *                integration list so the parent page updates, and auto-close.
 */
export function EvolutionGoQrDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [phase, setPhase] = useState<'naming' | 'qr' | 'connected'>('naming')
  const [instanceName, setInstanceName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [integrationId, setIntegrationId] = useState<string | null>(null)

  const provision = trpc.channels.provisionWhatsapp.useMutation({
    onSuccess: (data) => {
      setIntegrationId(data.integrationId)
      setPhase('qr')
      utils.channels.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  // Poll QR + status every 2s while in QR phase
  const qrQuery = trpc.channels.getWhatsappQR.useQuery(
    { integrationId: integrationId ?? '' },
    {
      enabled: phase === 'qr' && !!integrationId,
      refetchInterval: 2000,
      refetchIntervalInBackground: false,
    }
  )

  // Detect connection success → flip to celebration, then close
  useEffect(() => {
    if (phase === 'qr' && qrQuery.data?.status === 'active') {
      setPhase('connected')
      utils.channels.list.invalidate()
      toast.success('WhatsApp conectado!')
      const t = setTimeout(() => {
        handleClose()
      }, 1800)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrQuery.data?.status, phase])

  function handleClose() {
    onClose()
    // Reset on close so next open is clean
    setTimeout(() => {
      setPhase('naming')
      setInstanceName('')
      setDisplayName('')
      setIntegrationId(null)
    }, 200)
  }

  // Auto-derive displayName from instanceName (until user types in it)
  function onInstanceNameChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    setInstanceName(cleaned)
    if (!displayName || displayName === toDisplayDefault(instanceName)) {
      setDisplayName(toDisplayDefault(cleaned))
    }
  }

  const valid = instanceName.length >= 3 && displayName.length >= 2

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            {phase === 'naming' && 'Conectar WhatsApp'}
            {phase === 'qr' && 'Escaneie o QR Code'}
            {phase === 'connected' && 'Conectado!'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'naming' && 'Vamos criar uma instância WhatsApp pra você. Leva ~10 segundos.'}
            {phase === 'qr' && 'Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho'}
            {phase === 'connected' && 'Sua instância está pronta. O agente já pode enviar mensagens por ela.'}
          </DialogDescription>
        </DialogHeader>

        {/* ───── Phase 1: Naming ───── */}
        {phase === 'naming' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Nome da instância <span className="text-[var(--danger)]">*</span>
              </label>
              <Input
                value={instanceName}
                onChange={(e) => onInstanceNameChange(e.target.value)}
                placeholder="ex: vendas-principal"
                autoFocus
              />
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                Apenas letras, números, hífen e underscore. Esse nome fica no servidor.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
                Nome de exibição <span className="text-[var(--danger)]">*</span>
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ex: WhatsApp Vendas"
              />
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                Como vai aparecer pra você na lista de integrações.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={provision.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => provision.mutate({ instanceName, displayName })}
                disabled={!valid || provision.isPending}
              >
                {provision.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Criando instância...
                  </>
                ) : (
                  'Criar e gerar QR'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ───── Phase 2: QR ───── */}
        {phase === 'qr' && (
          <div className="space-y-3">
            {qrQuery.data?.qrCode ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="rounded-lg border-2 p-4"
                  style={{ borderColor: 'var(--border)', backgroundColor: '#fff' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      qrQuery.data.qrCode.startsWith('data:')
                        ? qrQuery.data.qrCode
                        : `data:image/png;base64,${qrQuery.data.qrCode}`
                    }
                    alt="QR Code WhatsApp"
                    className="h-80 w-80"
                  />
                </div>
                <p className="text-center text-sm text-[var(--text-tertiary)]">
                  O QR expira em ~30s. Se passar, ele é renovado automaticamente.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                <p className="text-xs text-[var(--text-secondary)]">Aguardando QR Code do servidor...</p>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  (Pode levar até 5 segundos)
                </p>
              </div>
            )}

            <div className="rounded-lg border p-4 text-sm text-[var(--text-secondary)]">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Abra o WhatsApp no celular que vai conectar</li>
                <li>Toque em <strong>Configurações</strong> → <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Aponte a câmera pro QR Code acima</li>
              </ol>
            </div>

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => qrQuery.refetch()}>
                <RefreshCw className="mr-1 h-3 w-3" />
                Renovar
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {/* ───── Phase 3: Connected ───── */}
        {phase === 'connected' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2} />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              WhatsApp conectado com sucesso!
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">Fechando em instantes...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function toDisplayDefault(slug: string): string {
  if (!slug) return ''
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
