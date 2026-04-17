'use client'

import { useState } from 'react'
import { Sparkles, Loader2, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc-client'
import { toast } from 'sonner'
import type { AgentDefinition } from '@/lib/agents'
import { AgentFlowPreview } from './agent-flow-preview'

const EXAMPLES = [
  'Agente que qualifica leads de RH usando BANT e envia WhatsApp quando score >= 70',
  'Agente que reaquece leads sem resposta há 7+ dias com follow-up personalizado',
  'Agente SDR 24/7 que responde mensagens no WhatsApp, qualifica e agenda reuniões',
  'Agente que classifica respostas de email e move o lead no pipeline automaticamente',
]

/**
 * The NL creator — the showpiece of Agentes v2. User describes what the
 * agent should do; the local LLM compiles into a strict DSL; preview + save.
 *
 * This is the primary hot path for Qwen3 local. The `compile` call is
 * structured extract, so it also validates against a JSON schema which keeps
 * latency predictable.
 */
export function AgentCreatorCard() {
  const [expanded, setExpanded] = useState(false)
  const [description, setDescription] = useState('')
  const [compiled, setCompiled] = useState<AgentDefinition | null>(null)
  const [agentName, setAgentName] = useState('')

  const utils = trpc.useUtils()

  const compile = trpc.agents.compile.useMutation({
    onSuccess: (data) => {
      setCompiled(data.definition)
      toast.success(`Definição compilada (${data.modelId})`)
    },
    onError: (e) => toast.error(`Erro ao compilar: ${e.message}`),
  })

  const create = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast.success('Agente criado com sucesso')
      utils.agents.list.invalidate()
      setExpanded(false)
      setDescription('')
      setCompiled(null)
      setAgentName('')
    },
    onError: (e) => toast.error(`Erro ao criar: ${e.message}`),
  })

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="group flex h-full w-full items-center justify-between gap-4 rounded-xl border-2 border-dashed p-5 transition-all hover:shadow-md"
        style={{
          borderColor: 'color-mix(in oklab, #F59E0B 35%, var(--border))',
          backgroundColor: 'color-mix(in oklab, #F59E0B 4%, var(--surface-1))',
        }}
      >
        <div className="flex items-center gap-4 text-left">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-[1.05]"
            style={{
              backgroundColor: 'color-mix(in oklab, #F59E0B 16%, transparent)',
              color: '#F59E0B',
            }}
          >
            <Sparkles className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div>
            <div
              className="text-[15px] font-semibold text-[var(--text-primary)]"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '-0.01em',
              }}
            >
              Criar agente com IA
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Descreva o que o agente deve fazer — a IA monta o fluxo pra você
            </div>
          </div>
        </div>
        <span
          className="hidden shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase sm:inline-flex"
          style={{
            backgroundColor: '#F59E0B',
            color: '#fff',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
          }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.5} />
          Começar
        </span>
      </button>
    )
  }

  return (
    <div
      className="col-span-full rounded-xl border p-5"
      style={{
        borderColor: 'var(--primary)',
        backgroundColor: 'color-mix(in oklab, var(--primary) 3%, var(--surface-1))',
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Criar agente customizado
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setExpanded(false)
            setDescription('')
            setCompiled(null)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!compiled ? (
        <>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Descreva em linguagem natural o que o agente deve fazer. Inclua canal, critérios e
            objetivo. A IA vai compilar em uma definição estruturada que você pode revisar antes
            de ativar.
          </p>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Agente que qualifica leads de RH usando BANT e envia WhatsApp se score >= 70"
            rows={4}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--surface-1)',
              color: 'var(--text-primary)',
            }}
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)]"
                style={{ borderColor: 'var(--border)' }}
              >
                {ex.length > 60 ? `${ex.slice(0, 57)}...` : ex}
              </button>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              onClick={() => compile.mutate({ description })}
              disabled={description.length < 10 || compile.isPending}
            >
              {compile.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Compilando com IA...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" />
                  Compilar definição
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Revise a definição compilada. Pode salvar como rascunho e editar depois.
          </p>

          {/* Flow preview — the star of the compiled state */}
          <div
            className="mb-3 rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
          >
            <div
              className="mb-2 text-[10px] font-bold uppercase text-[var(--text-tertiary)]"
              style={{
                fontFamily: 'var(--font-display), var(--font-sans), system-ui, sans-serif',
                letterSpacing: '0.08em',
              }}
            >
              Fluxo compilado
            </div>
            <AgentFlowPreview definition={compiled} maxSteps={8} />
          </div>

          {/* Summary */}
          <div
            className="mb-3 rounded-lg border p-3 text-xs space-y-2"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
          >
            <div>
              <span className="font-semibold text-[var(--text-secondary)]">Objetivo: </span>
              <span className="text-[var(--text-primary)]">{compiled.goal}</span>
            </div>
            {compiled.tools.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-[var(--text-secondary)]">Ações: </span>
                {compiled.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: 'color-mix(in oklab, #10B981 12%, transparent)',
                      color: '#10B981',
                    }}
                  >
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
            {compiled.channels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-[var(--text-secondary)]">Canais: </span>
                {compiled.channels.map((c) => (
                  <span
                    key={c}
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: 'color-mix(in oklab, #3B82F6 12%, transparent)',
                      color: '#3B82F6',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Name + create */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Nome do agente"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--surface-1)',
                color: 'var(--text-primary)',
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompiled(null)}
            >
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (agentName.length < 2) {
                  toast.error('Informe um nome com pelo menos 2 caracteres')
                  return
                }
                create.mutate({
                  name: agentName,
                  category: 'custom',
                  status: 'draft',
                  definition: compiled as unknown as Record<string, unknown>,
                })
              }}
              disabled={agentName.length < 2 || create.isPending}
            >
              {create.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  Criar como rascunho
                  <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
