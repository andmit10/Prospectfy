'use client'

import { useMemo } from 'react'
import { trpc } from '@/lib/trpc-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, MessageSquare, Sparkles } from 'lucide-react'
import {
  renderTemplate,
  unknownTokens,
  type TemplateVars,
} from '@/lib/template/render-template'
import type { DraftStep } from './step-editor'

type Props = {
  steps: DraftStep[]
}

/**
 * Live WhatsApp-style preview for the campaign cadence. Fetches the first
 * lead in the current org (via leads.list) and substitutes `{{vars}}` in
 * each step's template so the user sees the exact message the first lead
 * would receive. Falls back to sample data if the org has no leads yet.
 */
export function MessagePreview({ steps }: Props) {
  const { data } = trpc.leads.list.useQuery({ page: 1, pageSize: 1 })
  const firstLead = data?.leads?.[0] ?? null

  const sample: TemplateVars = useMemo(
    () => ({
      decisor_nome: firstLead?.decisor_nome,
      decisor_cargo: firstLead?.decisor_cargo,
      empresa_nome: firstLead?.empresa_nome,
      segmento: firstLead?.segmento,
      cidade: firstLead?.cidade,
      estado: firstLead?.estado,
    }),
    [firstLead]
  )

  const activeSteps = steps.filter((s) => s.mensagem_template.trim())

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle
          className="text-[14px] font-semibold flex items-center gap-2"
          style={{
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          <Sparkles className="h-4 w-4 text-primary" />
          Preview ao vivo
        </CardTitle>
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
          {firstLead ? firstLead.decisor_nome.split(' ')[0] : 'Exemplo'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {!firstLead && (
          <p className="text-xs text-muted-foreground">
            Nenhum lead ainda — usando dados de exemplo. Assim que você importar
            leads, o preview usará o primeiro da sua lista.
          </p>
        )}

        {activeSteps.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Os previews aparecerão aqui conforme você escrever os templates.
          </p>
        ) : (
          <div className="space-y-3">
            {activeSteps.map((step) => {
              const unknowns = unknownTokens(step.mensagem_template)
              const rendered = renderTemplate(step.mensagem_template, sample)
              return (
                <WhatsAppBubble
                  key={step.step_order}
                  stepOrder={step.step_order}
                  delayHours={step.delay_hours}
                  body={rendered}
                  channel={step.canal}
                  unknowns={unknowns}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WhatsAppBubble({
  stepOrder,
  delayHours,
  body,
  channel,
  unknowns,
}: {
  stepOrder: number
  delayHours: number
  body: string
  channel: string
  unknowns: string[]
}) {
  const isWhatsapp = channel === 'whatsapp'
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
        <MessageSquare className="h-3 w-3" />
        Step {stepOrder} · {channel}
        {delayHours > 0 && <span className="font-normal normal-case">· {delayHours}h após</span>}
      </div>
      <div
        className={`text-sm whitespace-pre-wrap rounded-lg p-3 ${
          isWhatsapp
            ? 'rounded-tl-none'
            : 'rounded-tl-none border'
        }`}
        style={
          isWhatsapp
            ? {
                backgroundColor: 'color-mix(in oklab, #25D366 12%, transparent)',
                color: 'var(--text-primary)',
                border: '1px solid color-mix(in oklab, #25D366 25%, transparent)',
              }
            : {
                backgroundColor: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }
        }
      >
        {body}
      </div>
      {unknowns.length > 0 && (
        <div
          className="flex items-start gap-1.5 text-[11px] rounded p-1.5"
          style={{
            backgroundColor: 'color-mix(in oklab, #F59E0B 10%, transparent)',
            color: '#B45309',
          }}
        >
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Variáveis desconhecidas: {unknowns.map((u) => `{{${u}}}`).join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}
