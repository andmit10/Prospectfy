'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Briefcase,
  Loader2,
  CheckCircle2,
  Wrench,
  Rocket,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'

/**
 * LinkedIn connect flow — two models:
 *
 *   BYOU    — customer has (or creates) their own Unipile account and
 *             pastes DSN + apiKey + accountId. We delegate to the standard
 *             ConnectDialog by calling `onChooseByou()` and closing.
 *
 *   Managed — Ativafy provisions the Unipile account. We call
 *             channels.provisionLinkedinManaged which:
 *               * creates the integration row (status=disconnected)
 *               * adds the linkedin_unipile plan_addons row
 *               * returns a hosted auth URL we open in a new tab
 *             The webhook at /api/webhooks/unipile/account-linked finishes
 *             the setup when the customer logs in. We poll
 *             getLinkedinConnectionStatus every 2s to detect success.
 */
export function UnipileChoiceDialog({
  open,
  onClose,
  onChooseByou,
}: {
  open: boolean
  onClose: () => void
  onChooseByou: () => void
}) {
  const utils = trpc.useUtils()
  const { data: managed } = trpc.channels.linkedinManagedAvailable.useQuery(undefined, {
    enabled: open,
  })
  const managedAvailable = managed?.available ?? false

  const [phase, setPhase] = useState<'choose' | 'waiting' | 'connected'>('choose')
  const [integrationId, setIntegrationId] = useState<string | null>(null)

  const provision = trpc.channels.provisionLinkedinManaged.useMutation({
    onSuccess: ({ integrationId: id, authUrl }) => {
      setIntegrationId(id)
      setPhase('waiting')
      // Open in a new tab so the customer can come back to Ativafy while we poll.
      window.open(authUrl, '_blank', 'noopener,noreferrer')
      utils.channels.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const statusQuery = trpc.channels.getLinkedinConnectionStatus.useQuery(
    { integrationId: integrationId ?? '' },
    {
      enabled: phase === 'waiting' && !!integrationId,
      refetchInterval: 2000,
    }
  )

  useEffect(() => {
    if (phase === 'waiting' && statusQuery.data?.status === 'active') {
      setPhase('connected')
      utils.channels.list.invalidate()
      toast.success('LinkedIn conectado!')
      const t = setTimeout(() => {
        handleClose()
      }, 1800)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data?.status, phase])

  function handleClose() {
    onClose()
    setTimeout(() => {
      setPhase('choose')
      setIntegrationId(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[var(--primary)]" />
            {phase === 'choose' && 'Conectar LinkedIn'}
            {phase === 'waiting' && 'Aguardando login no LinkedIn'}
            {phase === 'connected' && 'Conectado!'}
          </DialogTitle>
          <DialogDescription>
            {phase === 'choose' &&
              'Escolha como conectar. Você pode mudar depois se quiser.'}
            {phase === 'waiting' &&
              'Abrimos uma nova aba com o login do LinkedIn via Unipile. Conclua por lá — essa janela atualiza sozinha.'}
            {phase === 'connected' && 'Tudo pronto. Sua conta LinkedIn está ativa no Ativafy.'}
          </DialogDescription>
        </DialogHeader>

        {/* ───── Phase: Choose ───── */}
        {phase === 'choose' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* BYOU card */}
            <button
              type="button"
              onClick={() => {
                onChooseByou()
                handleClose()
              }}
              className="group flex flex-col items-start gap-3 rounded-lg border-2 p-5 text-left transition-colors hover:border-[var(--primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                  }}
                >
                  <Wrench className="h-5 w-5 text-[var(--primary)]" />
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: 'color-mix(in oklab, #10B981 14%, transparent)',
                    color: '#10B981',
                    letterSpacing: '0.06em',
                  }}
                >
                  Grátis
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Usar minha conta Unipile
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Você cria uma conta na Unipile e cola as credenciais (DSN + API Key +
                  Account ID) aqui. Sem custo extra do Ativafy.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] group-hover:underline">
                Continuar
                <ArrowRight className="h-3 w-3" />
              </span>
            </button>

            {/* Managed card — disabled when env vars missing */}
            <button
              type="button"
              disabled={!managedAvailable || provision.isPending}
              onClick={() => provision.mutate()}
              className="group flex flex-col items-start gap-3 rounded-lg border-2 p-5 text-left transition-colors enabled:hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: 'color-mix(in oklab, #F59E0B 14%, transparent)',
                  }}
                >
                  <Rocket className="h-5 w-5 text-amber-600" />
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor: 'color-mix(in oklab, #F59E0B 14%, transparent)',
                    color: '#B45309',
                    letterSpacing: '0.06em',
                  }}
                >
                  R$ 299/mês
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Ativafy gerencia pra mim
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  A gente cria a conta Unipile, você só faz login no LinkedIn. Cobrança
                  junto da sua assinatura do Ativafy.
                  {!managedAvailable && (
                    <span className="mt-1 block text-[11px] italic text-[var(--text-tertiary)]">
                      Temporariamente indisponível neste ambiente.
                    </span>
                  )}
                </p>
              </div>
              {provision.isPending ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Provisionando...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] group-hover:underline">
                  Conectar
                  <ExternalLink className="h-3 w-3" />
                </span>
              )}
            </button>
          </div>
        )}

        {/* ───── Phase: Waiting ───── */}
        {phase === 'waiting' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--primary)]" />
            <p className="text-center text-sm text-[var(--text-secondary)]">
              Faça login no LinkedIn na nova aba que abrimos. Quando terminar, essa tela
              vai atualizar sozinha.
            </p>
            <p className="text-center text-[11px] text-[var(--text-tertiary)]">
              Se a aba não abriu, desative o bloqueador de popups e tente novamente.
            </p>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        )}

        {/* ───── Phase: Connected ───── */}
        {phase === 'connected' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={2} />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              LinkedIn conectado com sucesso!
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">Fechando em instantes...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
