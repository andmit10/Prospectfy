'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc-client'
import { Clock, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Shows the current trial countdown (days left + leads used/50) in the header
 * and opens an upgrade dialog on click. Paid plans render nothing.
 */
export function TrialBadge() {
  const [open, setOpen] = useState(false)
  const { data } = trpc.trial.getStatus.useQuery(undefined, {
    refetchInterval: 60_000, // keep the counter fresh while the tab is open
    staleTime: 30_000,
  })

  if (!data) return null
  if (data.plan !== 'trial') return null

  const warn = data.blocked || data.daysLeft <= 2 || data.leadsGenerated >= data.leadsLimit - 10
  const color = data.blocked ? '#EF4444' : warn ? '#F59E0B' : '#10B981'
  const label = data.expired
    ? 'Trial expirado'
    : data.exhausted
    ? 'Limite atingido'
    : `${data.daysLeft}d · ${data.leadsGenerated}/${data.leadsLimit}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors"
        style={{
          borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
          backgroundColor: `color-mix(in oklab, ${color} 10%, transparent)`,
          color,
          letterSpacing: '0.02em',
        }}
        title={
          data.blocked
            ? 'Seu trial acabou — faça upgrade para continuar'
            : 'Trial ativo — clique para ver planos'
        }
      >
        <Clock className="h-3 w-3" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {data.blocked ? 'Trial acabou' : 'Seu trial Ativafy'}
            </DialogTitle>
            <DialogDescription>
              {data.blocked
                ? 'Faça upgrade para continuar gerando leads e enviando mensagens automaticamente pelo agente.'
                : `Você tem ${data.daysLeft} dia${data.daysLeft === 1 ? '' : 's'} restante${data.daysLeft === 1 ? '' : 's'} e já gerou ${data.leadsGenerated} de ${data.leadsLimit} leads incluídos.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <Row label="Dias restantes" value={data.expired ? '0' : String(data.daysLeft)} warn={data.expired} />
            <Row
              label="Leads gerados"
              value={`${data.leadsGenerated} / ${data.leadsLimit}`}
              warn={data.exhausted}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Agora não
            </Button>
            <Link
              href="/settings/billing"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              Ver planos
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${warn ? 'text-destructive' : ''}`}>{value}</span>
    </div>
  )
}
