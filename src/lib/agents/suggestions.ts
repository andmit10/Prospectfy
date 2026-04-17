import { createServiceClient } from '@/lib/supabase/service'
import { llm } from '@/lib/llm'

/**
 * Contextual AI suggestions generator.
 *
 * Runs per organization (scheduled nightly by `workers/agent-suggestions-worker.ts`).
 * Reads `agent_metrics` trends + idle segments and asks the local LLM to
 * produce actionable recommendations with structured shape.
 *
 * The LLM is used for the _narrative_ part (title + rationale). The RULES
 * that surface candidate cases are deterministic SQL so we don't pay tokens
 * for leads the LLM can't fix.
 */

type SuggestionCandidate = {
  kind:
    | 'activate_template'
    | 'tune_schedule'
    | 'improve_prompt'
    | 'add_knowledge'
    | 'pause_underperformer'
    | 'duplicate_winner'
    | 'new_segment'
  agentId?: string
  score: number
  data: Record<string, unknown>
}

const SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 5, maxLength: 120 },
    rationale: { type: 'string', minLength: 20, maxLength: 400 },
  },
  required: ['title', 'rationale'],
} as const

/**
 * Pull candidates from hard signals. Intentionally strict — we'd rather miss
 * a case than overwhelm the operator with noisy tips.
 */
async function gatherCandidates(orgId: string): Promise<SuggestionCandidate[]> {
  const supabase = createServiceClient()
  const candidates: SuggestionCandidate[] = []

  const sinceISO = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10)

  // Active agents + aggregated 14d stats.
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, status, category')
    .eq('organization_id', orgId)
    .in('status', ['active', 'draft', 'paused'])

  const { data: metrics } = await supabase
    .from('agent_metrics')
    .select('agent_id, executions, responses, meetings, avg_latency_ms, total_cost_usd, failures')
    .eq('organization_id', orgId)
    .gte('period_date', sinceISO)

  const byAgent: Record<
    string,
    { executions: number; responses: number; meetings: number; failures: number; cost: number }
  > = {}
  for (const row of metrics ?? []) {
    const id = row.agent_id as string
    const acc = byAgent[id] ?? {
      executions: 0,
      responses: 0,
      meetings: 0,
      failures: 0,
      cost: 0,
    }
    acc.executions += row.executions as number
    acc.responses += row.responses as number
    acc.meetings += row.meetings as number
    acc.failures += row.failures as number
    acc.cost += Number(row.total_cost_usd ?? 0)
    byAgent[id] = acc
  }

  // Rule 1 — underperformer: active agent with ≥20 executions and <2% reply.
  for (const a of agents ?? []) {
    if (a.status !== 'active') continue
    const m = byAgent[a.id as string]
    if (!m || m.executions < 20) continue
    const replyRate = m.responses / m.executions
    if (replyRate < 0.02) {
      candidates.push({
        kind: 'pause_underperformer',
        agentId: a.id as string,
        score: Math.min(0.9, 0.4 + (0.02 - replyRate) * 20),
        data: { name: a.name, executions: m.executions, responses: m.responses, replyRate },
      })
    }
  }

  // Rule 2 — winner: reply rate ≥15% → suggest duplication for new segment.
  for (const a of agents ?? []) {
    if (a.status !== 'active') continue
    const m = byAgent[a.id as string]
    if (!m || m.executions < 20) continue
    const replyRate = m.responses / m.executions
    if (replyRate >= 0.15) {
      candidates.push({
        kind: 'duplicate_winner',
        agentId: a.id as string,
        score: Math.min(0.85, 0.5 + replyRate),
        data: { name: a.name, category: a.category, replyRate },
      })
    }
  }

  // Rule 3 — new segment: large pool of leads from a segment without any agent.
  const { data: segmentCounts } = await supabase
    .from('leads')
    .select('segmento')
    .eq('organization_id', orgId)
    .not('segmento', 'is', null)
    .is('deleted_at', null)
    .limit(2000)

  const segTotals: Record<string, number> = {}
  for (const r of segmentCounts ?? []) {
    const s = (r.segmento as string | null)?.trim()
    if (!s) continue
    segTotals[s] = (segTotals[s] ?? 0) + 1
  }
  const topSegments = Object.entries(segTotals)
    .filter(([, n]) => n >= 50)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
  for (const [segment, count] of topSegments) {
    candidates.push({
      kind: 'new_segment',
      score: Math.min(0.75, 0.4 + count / 500),
      data: { segment, leadCount: count },
    })
  }

  // Rule 4 — KB-add: if no KB exists and ≥1 active agent uses `search_knowledge`.
  const { count: kbCount } = await supabase
    .from('knowledge_bases')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', orgId)
  if ((kbCount ?? 0) === 0) {
    const usesKb = (agents ?? []).some(
      (a) =>
        a.status === 'active' &&
        Array.isArray((a as unknown as { tools?: string[] }).tools) &&
        (a as unknown as { tools: string[] }).tools.includes('search_knowledge')
    )
    if (usesKb) {
      candidates.push({
        kind: 'add_knowledge',
        score: 0.8,
        data: {},
      })
    }
  }

  return candidates
    .filter((c, i, arr) => arr.findIndex((x) => x.kind === c.kind && x.agentId === c.agentId) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

async function renderSuggestion(candidate: SuggestionCandidate, orgId: string) {
  const brief = JSON.stringify(candidate, null, 2)
  try {
    const result = await llm.extract<{ title: string; rationale: string }>({
      system:
        'Você é um especialista em otimização de agentes de prospecção. Gere título curto e rationale curto em pt-BR baseado no contexto.',
      user: `Kind: ${candidate.kind}\nSignals:\n${brief}\n\nRetorne {title, rationale} em português. Rationale deve referenciar números concretos do input.`,
      schema: SUGGESTION_SCHEMA as unknown as Record<string, unknown>,
      orgId,
    })
    return {
      ok: true as const,
      title: result.data.title,
      rationale: result.data.rationale,
      modelId: result.modelId,
    }
  } catch {
    return { ok: false as const }
  }
}

/**
 * Main entrypoint — called per org by the suggestions worker. Idempotent:
 * expires old pending suggestions and inserts new ones fresh.
 */
export async function generateSuggestionsForOrg(orgId: string): Promise<{ inserted: number }> {
  const supabase = createServiceClient()

  // Expire pending suggestions older than 7 days — let the operator see a
  // refreshed feed each week.
  await supabase
    .from('agent_suggestions')
    .update({ status: 'expired' })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())

  const candidates = await gatherCandidates(orgId)
  if (candidates.length === 0) return { inserted: 0 }

  const rows: Array<{
    organization_id: string
    agent_id: string | null
    kind: string
    title: string
    rationale: string
    payload: Record<string, unknown>
    score: number
    generated_by_model: string | null
    expires_at: string
  }> = []

  for (const c of candidates) {
    const rendered = await renderSuggestion(c, orgId)
    if (!rendered.ok) continue
    rows.push({
      organization_id: orgId,
      agent_id: c.agentId ?? null,
      kind: c.kind,
      title: rendered.title,
      rationale: rendered.rationale,
      payload: c.data,
      score: c.score,
      generated_by_model: rendered.modelId ?? null,
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    })
  }

  if (rows.length === 0) return { inserted: 0 }
  const { error } = await supabase.from('agent_suggestions').insert(rows)
  if (error) throw error
  return { inserted: rows.length }
}
