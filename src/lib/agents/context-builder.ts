import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveAsWorker } from '@/lib/rag'

/**
 * Build the per-run context pack the agent's LLM steps see. This is the
 * "universe" for one execution:
 *   - lead row
 *   - recent interactions (history)
 *   - retrieved KB chunks (pre-fetched when the agent has `kb_ids`)
 *   - organization settings (company name, tone preferences)
 *
 * We keep it pure server-side and call it once per run so every step shares
 * the same snapshot. Steps can still retrieve more via the `retrieve` step
 * type when they need a specific query.
 */

export type RunContext = {
  orgId: string
  agentId: string
  runId: string
  leadId: string | null
  companyName: string
  /** Lead snapshot as a plain object (or null when the run isn't lead-bound). */
  lead: Record<string, unknown> | null
  /** Last ≤10 interactions, oldest first, formatted as plain text lines. */
  historyText: string
  /** Pre-built RAG context block, wrapped in the safe fence. Empty when no kb_ids. */
  knowledgeContext: string
  /** Vars captured across the run — mutated by steps. */
  vars: Record<string, unknown>
  /** Agent whitelists enforced by the runtime + tools. */
  allowedTools: string[]
  allowedChannels: string[]
  allowedKbIds: string[]
}

export async function buildRunContext(args: {
  supabase: SupabaseClient
  orgId: string
  agentId: string
  runId: string
  leadId: string | null
  tools: string[]
  channels: string[]
  kbIds: string[]
  initialQuery?: string
}): Promise<RunContext> {
  // Fetch lead + interactions in parallel.
  const [leadRes, interactionsRes, orgRes] = await Promise.all([
    args.leadId
      ? args.supabase
          .from('leads')
          .select('*')
          .eq('id', args.leadId)
          .eq('organization_id', args.orgId)
          .single()
      : Promise.resolve({ data: null }),
    args.leadId
      ? args.supabase
          .from('interactions')
          .select('canal, tipo, mensagem_enviada, resposta_lead, created_at')
          .eq('lead_id', args.leadId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    args.supabase
      .from('organizations')
      .select('name')
      .eq('id', args.orgId)
      .maybeSingle(),
  ])

  const lead = (leadRes.data as Record<string, unknown> | null) ?? null
  const interactions = (interactionsRes.data as Array<{
    canal: string
    tipo: string
    mensagem_enviada: string | null
    resposta_lead: string | null
    created_at: string
  }> | null) ?? []

  const historyText =
    interactions.length === 0
      ? 'Nenhuma interação anterior.'
      : interactions
          .reverse()
          .map(
            (i) =>
              `[${new Date(i.created_at).toLocaleString('pt-BR')}] ${i.canal}/${i.tipo}` +
              (i.mensagem_enviada ? ` — enviado: "${i.mensagem_enviada.slice(0, 140)}"` : '') +
              (i.resposta_lead ? ` — resposta: "${i.resposta_lead.slice(0, 140)}"` : '')
          )
          .join('\n')

  // Pre-fetch KB context when the agent has a default query seed. Without a
  // seed we skip — individual steps can `retrieve` on demand.
  let knowledgeContext = ''
  if (args.kbIds.length > 0 && args.initialQuery) {
    try {
      const pack = await retrieveAsWorker({
        orgId: args.orgId,
        kbIds: args.kbIds,
        query: args.initialQuery,
        topK: 6,
      })
      knowledgeContext = pack.contextText
    } catch {
      // Retrieval failure is non-fatal; agent continues without context.
    }
  }

  return {
    orgId: args.orgId,
    agentId: args.agentId,
    runId: args.runId,
    leadId: args.leadId,
    companyName: (orgRes.data?.name as string) ?? 'nossa empresa',
    lead,
    historyText,
    knowledgeContext,
    vars: {},
    allowedTools: args.tools,
    allowedChannels: args.channels,
    allowedKbIds: args.kbIds,
  }
}

/**
 * Resolve `{path.to.var}` placeholders inside a string against the run vars
 * + lead fields. Used when step args say `content_var: "msg.message"`.
 */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const value = resolvePath(vars, path.trim())
    return value === undefined || value === null ? '' : String(value)
  })
}

export function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}
