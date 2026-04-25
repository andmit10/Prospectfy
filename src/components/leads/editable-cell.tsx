'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'

type EditableField =
  | 'decisor_nome'
  | 'decisor_cargo'
  | 'whatsapp'
  | 'telefone'
  | 'email'
  | 'cnpj'
  | 'cidade'
  | 'estado'

const FIELD_INPUT_TYPE: Record<EditableField, 'text' | 'tel' | 'email'> = {
  decisor_nome: 'text',
  decisor_cargo: 'text',
  whatsapp: 'tel',
  telefone: 'tel',
  email: 'email',
  cnpj: 'text',
  cidade: 'text',
  estado: 'text',
}

const FIELD_PLACEHOLDER: Record<EditableField, string> = {
  decisor_nome: 'Nome do decisor',
  decisor_cargo: 'Cargo',
  whatsapp: '5511999999999',
  telefone: '(11) 0000-0000',
  email: 'contato@empresa.com.br',
  cnpj: 'XX.XXX.XXX/XXXX-XX',
  cidade: 'Cidade',
  estado: 'UF',
}

/**
 * Cell editável inline. Comportamento:
 *   - Mostra valor (ou "—" se vazio) com pencil sutil ao lado
 *   - Click em qualquer lugar da célula → vira input
 *   - Enter ou ✓ → salva via tRPC `leads.update`
 *   - Esc ou ✗ → cancela
 *   - Blur fora dos botões → cancela (evita salvar acidental)
 *   - Loader2 spinner durante save
 *   - Toast success/error, invalidate cache do tRPC
 */
export function EditableCell({
  leadId,
  field,
  value,
  className = '',
  display,
  multiline = false,
}: {
  leadId: string
  field: EditableField
  value: string | null | undefined
  className?: string
  /** Optional custom display (ex: formatar telefone, deixar `cidade/UF`). */
  display?: React.ReactNode
  /** Use textarea em vez de input (default false). */
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const utils = trpc.useUtils()
  const updateMutation = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.success('Salvo')
      utils.leads.list.invalidate()
      setEditing(false)
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message ?? 'desconhecido'}`)
    },
  })

  useEffect(() => {
    if (editing) {
      // Precisa de microtask pra ref popular após o render
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select?.()
      })
    }
  }, [editing])

  // Reseta draft se value mudar externamente (ex: após enrich)
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed === (value ?? '')) {
      setEditing(false)
      return
    }
    updateMutation.mutate({ id: leadId, [field]: trimmed } as never)
  }
  function cancel() {
    setDraft(value ?? '')
    setEditing(false)
  }

  if (!editing) {
    const isEmpty = !value || (typeof value === 'string' && value.trim() === '')
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className={`group inline-flex max-w-full items-start gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] ${className}`}
        title="Clique para editar"
      >
        <span className={isEmpty ? 'text-[var(--text-tertiary)] italic' : ''}>
          {display ?? (isEmpty ? '—' : value)}
        </span>
        <Pencil
          className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />
      </button>
    )
  }

  const inputType = FIELD_INPUT_TYPE[field]
  const placeholder = FIELD_PLACEHOLDER[field]
  const InputEl = multiline ? 'textarea' : 'input'

  return (
    <div
      ref={containerRef}
      className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--primary)] bg-white p-0.5 shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <InputEl
        ref={inputRef as never}
        type={multiline ? undefined : inputType}
        value={draft}
        placeholder={placeholder}
        disabled={updateMutation.isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        rows={multiline ? 2 : undefined}
        className="min-w-[100px] flex-1 rounded bg-transparent px-1.5 py-0.5 text-xs outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={commit}
        disabled={updateMutation.isPending}
        className="rounded bg-[var(--primary)] p-1 text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
        title="Salvar (Enter)"
      >
        {updateMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={updateMutation.isPending}
        className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        title="Cancelar (Esc)"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
