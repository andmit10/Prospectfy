'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Building2, Loader2 } from 'lucide-react'

/**
 * New Organization form — lets users spin up a second workspace (e.g. an
 * agency managing multiple brands). After creation, the router auto-switches
 * the caller to the new org, so we just invalidate cache + redirect home.
 */
export function NewOrganizationForm() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const create = trpc.organizations.create.useMutation({
    onSuccess: async () => {
      toast.success('Organização criada')
      await Promise.all([
        utils.organizations.list.invalidate(),
        utils.organizations.current.invalidate(),
      ])
      router.push('/dashboard')
      router.refresh()
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  })

  return (
    <div
      className="rounded-xl border p-6 space-y-5"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-1)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <Building2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Criar nova organização</h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Cada organização tem pipeline, agentes, integrações e cobrança próprios.
            Útil para agências gerenciando várias marcas.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Nome da organização
          </label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              // Auto-suggest a slug from the name unless user typed one.
              if (!slug || slug === autoSlug(name)) {
                setSlug(autoSlug(e.target.value))
              }
            }}
            placeholder="Acme Vendas Ltda"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            Slug (opcional)
          </label>
          <Input
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '-')
                  .replace(/-+/g, '-')
              )
            }
            placeholder="acme-vendas"
          />
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            Aparece em URLs. Se deixar vazio, geramos a partir do nome.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button
          onClick={() =>
            create.mutate({
              name,
              slug: slug || undefined,
            })
          }
          disabled={name.length < 2 || create.isPending}
        >
          {create.isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Criando...
            </>
          ) : (
            'Criar organização'
          )}
        </Button>
      </div>
    </div>
  )
}

function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
