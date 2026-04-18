'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'

/**
 * In-page help for the admin Feature Flags page. Admins use this screen
 * infrequently enough that the semantics (global vs plan vs org override)
 * are easy to forget — we keep the reference inline instead of hiding it
 * in a docs site.
 *
 * Collapsible so the page stays tight once you know what you're doing.
 */
export function FeatureFlagsHelp() {
  const [open, setOpen] = useState(true)

  return (
    <div
      className="rounded-xl border"
      style={{
        borderColor: 'color-mix(in oklab, var(--primary) 25%, var(--border))',
        backgroundColor: 'color-mix(in oklab, var(--primary) 4%, var(--surface-1))',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Info className="h-4 w-4 shrink-0" style={{ color: 'var(--primary)' }} />
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Como funcionam as feature flags?
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </button>

      {open && (
        <div
          className="space-y-4 px-4 pb-4 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <p>
            Feature flags são <strong>chaves de liga/desliga</strong> que controlam quem vê cada
            funcionalidade. Toda vez que o código pergunta "posso mostrar X pra essa org?", ele
            consulta essa tabela. Isso permite lançar features pra um subconjunto de clientes
            antes de abrir pra todos.
          </p>

          <div>
            <p className="mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              Como a resposta é calculada (em ordem de prioridade):
            </p>
            <ol
              className="list-decimal space-y-1.5 pl-5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <li>
                <strong>Global ligado</strong> → todo mundo vê, independente de plano ou org.
                (Usado pra lançamento geral.)
              </li>
              <li>
                <strong>Org específica na lista</strong> → só aquela org vê (ou não vê, se
                explicitamente bloqueada). Útil pra beta com cliente específico.
              </li>
              <li>
                <strong>Plano da org está nos planos habilitados</strong> → qualquer org nesse
                plano vê. É a regra mais comum — ex: "rag" disponível pra starter+.
              </li>
              <li>Se nada bate → <strong>desabilitado</strong> por padrão.</li>
            </ol>
          </div>

          <div>
            <p className="mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              Como mexer nesta tela:
            </p>
            <ul
              className="list-disc space-y-1.5 pl-5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <li>
                <strong>Clicar num plano</strong> (trial, starter, pro, etc.) alterna se ele tem
                acesso à flag. Pill preenchida = habilitado. Vazia = bloqueado.
              </li>
              <li>
                <strong>Habilitar global</strong> ignora os planos e libera pra todos. Cuidado
                com features que geram custo (LLM, WhatsApp, etc).
              </li>
              <li>
                <strong>Orgs específicas</strong> (override por org) — clique em
                "+ Adicionar org" pra buscar por nome ou slug. Útil pra liberar uma feature
                pra 1 cliente beta antes de abrir pro plano inteiro.
              </li>
            </ul>
          </div>

          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: 'color-mix(in oklab, #F59E0B 30%, var(--border))',
              backgroundColor: 'color-mix(in oklab, #F59E0B 4%, var(--surface-2))',
            }}
          >
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              ⚠️ <strong>Cache de 60s</strong> — mudanças feitas aqui propagam em até 1 minuto.
              Se precisar de efeito imediato (teste urgente), avise o usuário pra dar reload.
            </p>
          </div>

          <div>
            <p className="mb-2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              Flags comuns e o que controlam:
            </p>
            <ul
              className="space-y-1 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <li>
                <code className="font-mono">agents_custom</code> — agentes customizados via IA
              </li>
              <li>
                <code className="font-mono">rag</code> — bases de conhecimento (knowledge bases)
              </li>
              <li>
                <code className="font-mono">linkedin_channel</code> — canal LinkedIn disponível
              </li>
              <li>
                <code className="font-mono">evolution_whatsapp</code> — provider Evolution no
                catálogo de WhatsApp
              </li>
              <li>
                <code className="font-mono">multi_brand</code> — múltiplas marcas/orgs por conta
                (plano Agency)
              </li>
              <li>
                <code className="font-mono">auto_progression</code> — pipeline auto-progride via
                IA ao receber resposta
              </li>
              <li>
                <code className="font-mono">super_admin_ui</code> — expõe o painel super-admin
                (esconde por padrão)
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
