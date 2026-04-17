'use client'

import { useState } from 'react'
import { KanbanSquare, Plus, Star, Users, Lock } from 'lucide-react'
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
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadIds: string[]
  onAssigned?: () => void
}

export function AssignPipelineDialog({ open, onOpenChange, leadIds, onAssigned }: Props) {
  const [userMode, setUserMode] = useState<'existing' | 'new' | null>(null)
  const [userSelectedPipelineId, setUserSelectedPipelineId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({ nome: '', is_shared: false, is_default: false })

  const utils = trpc.useUtils()
  const { data: pipelines, isLoading } = trpc.pipelines.list.useQuery(undefined, { enabled: open })

  // Derive mode: user override else auto-switch to "new" when no pipelines exist.
  const hasNoPipelines = !!pipelines && pipelines.length === 0
  const mode: 'existing' | 'new' = userMode ?? (hasNoPipelines ? 'new' : 'existing')
  const setMode = (m: 'existing' | 'new') => setUserMode(m)

  // Derive selected pipeline: user's explicit choice, else default/first.
  const defaultPipeline = pipelines?.find((p) => p.is_default) ?? pipelines?.[0] ?? null
  const selectedPipelineId = userSelectedPipelineId ?? defaultPipeline?.id ?? null
  const setSelectedPipelineId = (id: string) => setUserSelectedPipelineId(id)

  const assignLeads = trpc.pipelines.assignLeads.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.updated} lead(s) enviados ao pipeline`)
      utils.leads.list.invalidate()
      utils.pipelines.list.invalidate()
      onOpenChange(false)
      onAssigned?.()
      // Reset
      setUserMode(null)
      setUserSelectedPipelineId(null)
      setNewForm({ nome: '', is_shared: false, is_default: false })
    },
    onError: (err) => toast.error('Erro: ' + err.message),
  })

  function handleSubmit() {
    if (leadIds.length === 0) {
      toast.error('Nenhum lead selecionado')
      return
    }

    if (mode === 'existing') {
      if (!selectedPipelineId) {
        toast.error('Selecione um pipeline')
        return
      }
      assignLeads.mutate({ leadIds, pipelineId: selectedPipelineId })
    } else {
      const nome = newForm.nome.trim()
      if (!nome) {
        toast.error('Nome do pipeline é obrigatório')
        return
      }
      assignLeads.mutate({
        leadIds,
        createPipeline: {
          nome,
          is_shared: newForm.is_shared,
          is_default: newForm.is_default,
        },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KanbanSquare className="h-5 w-5 text-[var(--primary)]" />
            Enviar para pipeline
          </DialogTitle>
          <DialogDescription>
            {leadIds.length} lead{leadIds.length !== 1 ? 's' : ''} ser{leadIds.length !== 1 ? 'ão' : 'á'} vinculado{leadIds.length !== 1 ? 's' : ''} ao pipeline escolhido.
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-1">
          <button
            onClick={() => setMode('existing')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'existing'
                ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
            disabled={!pipelines || pipelines.length === 0}
          >
            Usar existente
          </button>
          <button
            onClick={() => setMode('new')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'new'
                ? 'bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Plus className="inline h-3.5 w-3.5 mr-1" />
            Criar novo
          </button>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
                Carregando pipelines...
              </div>
            ) : !pipelines || pipelines.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
                Nenhum pipeline encontrado. Crie um novo.
              </div>
            ) : (
              pipelines.map((p) => {
                const isSelected = p.id === selectedPipelineId
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPipelineId(p.id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-all',
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                        : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {p.nome}
                          </span>
                          {p.is_default && (
                            <Star className="h-3 w-3 fill-[var(--primary)] text-[var(--primary)]" />
                          )}
                          {p.is_shared ? (
                            <Users className="h-3 w-3 text-[var(--text-tertiary)]" />
                          ) : (
                            <Lock className="h-3 w-3 text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        {p.descricao && (
                          <div className="mt-0.5 text-xs text-[var(--text-tertiary)] truncate">
                            {p.descricao}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-pipe-nome">Nome do pipeline</Label>
              <Input
                id="new-pipe-nome"
                placeholder="Ex: Outbound SDR"
                value={newForm.nome}
                onChange={(e) => setNewForm((f) => ({ ...f, nome: e.target.value }))}
                maxLength={60}
                autoFocus
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={newForm.is_shared}
                onCheckedChange={(v) => setNewForm((f) => ({ ...f, is_shared: !!v }))}
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
                checked={newForm.is_default}
                onCheckedChange={(v) => setNewForm((f) => ({ ...f, is_default: !!v }))}
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
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={assignLeads.isPending}>
            {assignLeads.isPending ? 'Enviando...' : 'Enviar para pipeline'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
