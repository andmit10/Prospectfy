'use client'

import { useState, useMemo } from 'react'
import { Plus, Check, Users, Lock, Star, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { KanbanBoard } from './kanban-board'
import { PipelineEditDialog, PipelineDeleteDialog } from './pipeline-edit-dialog'
import type { Pipeline } from '@/types'

export function PipelineSelector() {
  const [userSelectedId, setUserSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState({ nome: '', descricao: '', is_shared: false, is_default: false })
  const utils = trpc.useUtils()

  const { data: pipelines, isLoading } = trpc.pipelines.list.useQuery()

  const createPipeline = trpc.pipelines.create.useMutation({
    onSuccess: (created) => {
      toast.success(`Pipeline "${created.nome}" criado`)
      utils.pipelines.list.invalidate()
      setUserSelectedId(created.id)
      setDialogOpen(false)
      setForm({ nome: '', descricao: '', is_shared: false, is_default: false })
    },
    onError: (err) => toast.error('Erro ao criar pipeline: ' + err.message),
  })

  const setDefault = trpc.pipelines.setDefault.useMutation({
    onSuccess: () => {
      toast.success('Pipeline padrão atualizado')
      utils.pipelines.list.invalidate()
    },
    onError: (err) => toast.error('Erro: ' + err.message),
  })

  // Select the default pipeline on load
  const defaultPipeline = useMemo(
    () => pipelines?.find((p) => p.is_default) ?? pipelines?.[0] ?? null,
    [pipelines]
  )

  // Derive selected pipeline: user's explicit choice, else the default.
  // This avoids setState-inside-effect and keeps the UI reactive.
  const selectedId = userSelectedId ?? defaultPipeline?.id ?? null

  function handleCreate() {
    if (!form.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    createPipeline.mutate({
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || undefined,
      is_shared: form.is_shared,
      is_default: form.is_default,
    })
  }

  if (isLoading) {
    return <div className="h-10 w-60 animate-pulse rounded-lg bg-[var(--surface-2)]" />
  }

  const list = pipelines ?? []
  const selected = list.find((p) => p.id === selectedId) ?? defaultPipeline

  return (
    <div className="space-y-4">
      {/* Pipeline tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {list.map((p) => {
            const isActive = p.id === selected?.id
            return (
              <button
                key={p.id}
                onClick={() => setUserSelectedId(p.id)}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'shadow-sm'
                    : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                )}
                style={
                  isActive
                    ? {
                        borderColor: p.color ?? 'var(--primary)',
                        backgroundColor: `color-mix(in oklab, ${p.color ?? 'var(--primary)'} 12%, transparent)`,
                        color: p.color ?? 'var(--primary)',
                      }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: p.color ?? 'var(--primary)' }}
                />
                {p.is_default && <Star className="h-3 w-3 fill-current" />}
                <span>{p.nome}</span>
                {p.is_shared ? (
                  <Users className="h-3 w-3 opacity-70" />
                ) : (
                  <Lock className="h-3 w-3 opacity-50" />
                )}
              </button>
            )
          })}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Novo pipeline
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar novo pipeline</DialogTitle>
              <DialogDescription>
                Organize seus leads em pipelines separados (ex: Inbound, Outbound, Parceiros).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pipe-nome">Nome</Label>
                <Input
                  id="pipe-nome"
                  placeholder="Ex: Outbound SDR"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pipe-desc">Descrição (opcional)</Label>
                <Input
                  id="pipe-desc"
                  placeholder="Para que serve este pipeline?"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  maxLength={240}
                />
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
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    Definir como padrão
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">
                    Novos leads vão para este pipeline automaticamente
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createPipeline.isPending}>
                {createPipeline.isPending ? 'Criando...' : 'Criar pipeline'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {selected && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar pipeline
              </DropdownMenuItem>
              {!selected.is_default && (
                <DropdownMenuItem
                  onClick={() => setDefault.mutate(selected.id)}
                  disabled={setDefault.isPending}
                >
                  <Check className="h-4 w-4" />
                  Tornar padrão
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={list.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
                Excluir pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {selected?.descricao && (
        <p className="text-sm text-[var(--text-tertiary)]">{selected.descricao}</p>
      )}

      <KanbanBoard pipelineId={selected?.id ?? null} />

      <PipelineEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        pipeline={selected as Pipeline | null}
      />

      <PipelineDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pipeline={selected as Pipeline | null}
        otherPipelines={list.filter((p) => p.id !== selected?.id) as Pipeline[]}
        onDeleted={() => {
          setUserSelectedId(null)
        }}
      />
    </div>
  )
}
