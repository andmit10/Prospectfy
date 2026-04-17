'use client'

import { useState } from 'react'
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
import { ArrowRight, Trash2, Zap, Pause, Play, Plus } from 'lucide-react'

const TRIGGER_OPTIONS = [
  { value: 'click', label: 'Clique em link' },
  { value: 'reply_positive', label: 'Resposta positiva' },
  { value: 'reply_negative', label: 'Resposta negativa' },
  { value: 'reply_question', label: 'Pergunta do lead' },
  { value: 'reply_unsubscribe', label: 'Pedido de descadastro' },
  { value: 'meeting_requested', label: 'Pedido de agenda' },
  { value: 'no_response_days', label: 'Sem resposta por N dias' },
  { value: 'score_threshold', label: 'Score atingiu limiar' },
]

const STAGE_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'contatado', label: 'Contatado' },
  { value: 'respondeu', label: 'Respondeu' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'perdido', label: 'Perdido' },
]

export function PipelineRulesEditor() {
  const utils = trpc.useUtils()
  const { data: rules, isLoading } = trpc.pipelineRules.list.useQuery()
  const [creating, setCreating] = useState(false)

  const update = trpc.pipelineRules.update.useMutation({
    onSuccess: () => utils.pipelineRules.list.invalidate(),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  const del = trpc.pipelineRules.delete.useMutation({
    onSuccess: () => {
      toast.success('Regra removida')
      utils.pipelineRules.list.invalidate()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Regras de auto-progressão
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Quando o gatilho acontece, o lead avança automaticamente de estágio.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nova regra
        </Button>
      </div>

      {creating && <RuleForm onCancel={() => setCreating(false)} />}

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-[var(--text-tertiary)]">Carregando...</p>
        ) : (rules ?? []).length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <Zap className="mx-auto h-6 w-6 text-[var(--primary)]" />
            <p className="mt-2 text-sm font-semibold">Nenhuma regra configurada</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Crie regras para mover leads automaticamente quando respondem ou clicam.
            </p>
          </div>
        ) : (
          (rules ?? []).map((r) => {
            const triggerLabel =
              TRIGGER_OPTIONS.find((t) => t.value === (r.trigger_type as string))?.label ??
              r.trigger_type
            return (
              <div
                key={r.id as string}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--surface-1)',
                  opacity: r.enabled ? 1 : 0.55,
                }}
              >
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  P{r.priority as number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{r.name as string}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                      {triggerLabel as string}
                    </span>
                    <ArrowRight className="h-3 w-3" />
                    {r.from_stage ? (
                      <>
                        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">
                          {r.from_stage as string}
                        </span>
                        <ArrowRight className="h-3 w-3" />
                      </>
                    ) : null}
                    <span
                      className="rounded px-1.5 py-0.5 font-semibold"
                      style={{
                        backgroundColor: 'color-mix(in oklab, var(--primary) 15%, transparent)',
                        color: 'var(--primary)',
                      }}
                    >
                      {r.to_stage as string}
                    </span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    update.mutate({ id: r.id as string, enabled: !(r.enabled as boolean) })
                  }
                  title={r.enabled ? 'Pausar' : 'Ativar'}
                >
                  {r.enabled ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Remover regra "${r.name}"?`)) {
                      del.mutate({ id: r.id as string })
                    }
                  }}
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--danger)]" />
                </Button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function RuleForm({ onCancel }: { onCancel: () => void }) {
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<string>('reply_positive')
  const [fromStage, setFromStage] = useState<string>('any')
  const [toStage, setToStage] = useState<string>('reuniao')
  const [priority, setPriority] = useState(100)

  const create = trpc.pipelineRules.create.useMutation({
    onSuccess: () => {
      toast.success('Regra criada')
      utils.pipelineRules.list.invalidate()
      onCancel()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--primary)', backgroundColor: 'var(--surface-1)' }}
    >
      <h3 className="mb-3 text-sm font-semibold">Nova regra</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Nome
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Cliente respondeu sim → Reunião"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Prioridade
          </label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Gatilho
          </label>
          <Select value={trigger} onValueChange={(v) => v && setTrigger(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Estágio atual (opcional)
          </label>
          <Select value={fromStage} onValueChange={(v) => v && setFromStage(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Qualquer estágio</SelectItem>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Mover para
          </label>
          <Select value={toStage} onValueChange={(v) => v && setToStage(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() =>
            create.mutate({
              name,
              triggerType: trigger as 'click' | 'reply_positive',
              fromStage:
                fromStage === 'any'
                  ? null
                  : (fromStage as 'novo' | 'contatado' | 'respondeu' | 'reuniao' | 'convertido' | 'perdido'),
              toStage: toStage as 'novo' | 'contatado' | 'respondeu' | 'reuniao' | 'convertido' | 'perdido',
              priority,
            })
          }
          disabled={name.length < 2 || create.isPending}
        >
          Criar regra
        </Button>
      </div>
    </div>
  )
}
