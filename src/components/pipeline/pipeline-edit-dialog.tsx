'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Pipeline } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline | null
}

const COLOR_OPTIONS = [
  '#2B88D8', // blue (default)
  '#9C44FF', // purple
  '#00A855', // green
  '#FF8A00', // orange
  '#E3365D', // pink/red
  '#5C6370', // slate
]

export function PipelineEditDialog({ open, onOpenChange, pipeline }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pipeline</DialogTitle>
          <DialogDescription>
            Ajuste nome, descrição, cor e compartilhamento.
          </DialogDescription>
        </DialogHeader>
        {pipeline && (
          // Re-mount the form body when the pipeline changes so useState picks
          // up fresh initial values — avoids setState-in-effect sync patterns.
          <EditForm
            key={pipeline.id}
            pipeline={pipeline}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: pipeline.nome,
    descricao: pipeline.descricao ?? '',
    is_shared: pipeline.is_shared,
    is_default: pipeline.is_default,
    color: pipeline.color ?? '#2B88D8',
  })

  const utils = trpc.useUtils()
  const update = trpc.pipelines.update.useMutation({
    onSuccess: () => {
      toast.success('Pipeline atualizado')
      utils.pipelines.list.invalidate()
      onClose()
    },
    onError: (err) => toast.error('Erro: ' + err.message),
  })

  function handleSubmit() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    update.mutate({
      id: pipeline.id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      is_shared: form.is_shared,
      is_default: form.is_default,
      color: form.color,
    })
  }

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-nome">Nome</Label>
          <Input
            id="edit-nome"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            maxLength={60}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-desc">Descrição</Label>
          <Input
            id="edit-desc"
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            maxLength={240}
            placeholder="Opcional"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className="h-7 w-7 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: form.color === c ? 'var(--text-primary)' : 'transparent',
                  transform: form.color === c ? 'scale(1.1)' : 'scale(1)',
                }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={form.is_shared}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_shared: !!v }))}
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-[var(--text-primary)]">
              Compartilhar com a conta
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              Outros usuários da sua conta verão este pipeline
            </div>
          </div>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={form.is_default}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: !!v }))}
            disabled={pipeline.is_default}
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-[var(--text-primary)]">
              Definir como padrão
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {pipeline.is_default
                ? 'Este já é o pipeline padrão'
                : 'Novos leads vão para este pipeline automaticamente'}
            </div>
          </div>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={update.isPending}>
          {update.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  )
}

type DeleteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pipeline | null
  otherPipelines: Pipeline[]
  onDeleted?: () => void
}

export function PipelineDeleteDialog({
  open,
  onOpenChange,
  pipeline,
  otherPipelines,
  onDeleted,
}: DeleteProps) {
  if (!pipeline) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir pipeline</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <strong>{pipeline.nome}</strong>? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        {/* Re-mount when the pipeline changes to reset moveTarget without effects. */}
        <DeleteForm
          key={pipeline.id}
          pipeline={pipeline}
          otherPipelines={otherPipelines}
          onClose={() => onOpenChange(false)}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  )
}

function DeleteForm({
  pipeline,
  otherPipelines,
  onClose,
  onDeleted,
}: {
  pipeline: Pipeline
  otherPipelines: Pipeline[]
  onClose: () => void
  onDeleted?: () => void
}) {
  const initialTarget =
    otherPipelines.length > 0
      ? (otherPipelines.find((p) => p.is_default) ?? otherPipelines[0]).id
      : 'unassigned'
  const [moveTarget, setMoveTarget] = useState<string>(initialTarget)

  const utils = trpc.useUtils()
  const del = trpc.pipelines.delete.useMutation({
    onSuccess: () => {
      toast.success('Pipeline excluído')
      utils.pipelines.list.invalidate()
      utils.leads.list.invalidate()
      onClose()
      onDeleted?.()
    },
    onError: (err) => toast.error('Erro: ' + err.message),
  })

  function handleDelete() {
    del.mutate({
      id: pipeline.id,
      moveLeadsTo: moveTarget === 'unassigned' ? null : moveTarget,
    })
  }

  return (
    <>
      <div className="space-y-2 py-2">
        <Label>Mover leads deste pipeline para:</Label>
        <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v ?? 'unassigned')}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Deixar sem pipeline</SelectItem>
            {otherPipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}{p.is_default ? ' · padrão' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[var(--text-tertiary)]">
          Os leads não serão apagados — só movidos para o destino escolhido.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={del.isPending}
        >
          {del.isPending ? 'Excluindo...' : 'Excluir pipeline'}
        </Button>
      </div>
    </>
  )
}
