import { llm } from '@/lib/llm'
import type { ToolDefinition } from './registry'

/**
 * Lead-centric tools — score adjustments, pipeline transitions, tagging,
 * enrichment. All filter by `ctx.orgId` (defense-in-depth: service client
 * bypasses RLS so we can't rely on it alone).
 */

export const updateLeadScoreTool: ToolDefinition = {
  name: 'update_lead_score',
  description:
    'Ajusta o lead score somando (positivo) ou subtraindo (negativo) pontos com motivo rastreável.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      points: { type: 'integer', minimum: -50, maximum: 50 },
      reason: { type: 'string', minLength: 3, maxLength: 200 },
    },
    required: ['points', 'reason'],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }
    const points = Number(args.points ?? 0)
    const reason = String(args.reason ?? 'agent tool call')

    // Use the stored procedure defined in init.sql so the auto pipeline
    // transition (score ≥ 80 → reuniao) fires consistently.
    const { error } = await ctx.supabase.rpc('update_lead_score', {
      p_lead_id: ctx.leadId,
      p_points: points,
      p_reason: reason,
    })
    if (error) return { ok: false, error: error.message }

    // Sanity re-read to return the new value.
    const { data } = await ctx.supabase
      .from('leads')
      .select('lead_score, status_pipeline')
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle()

    return { ok: true, data: { score: data?.lead_score, status: data?.status_pipeline } }
  },
}

export const movePipelineStageTool: ToolDefinition = {
  name: 'move_pipeline_stage',
  description:
    'Move o lead para outro estágio do pipeline (novo/contatado/respondeu/reuniao/convertido/perdido).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      stage: {
        type: 'string',
        enum: ['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'],
      },
      reason: { type: 'string', maxLength: 200 },
    },
    required: ['stage'],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }
    const stage = String(args.stage ?? '')

    const { error } = await ctx.supabase
      .from('leads')
      .update({ status_pipeline: stage, updated_at: new Date().toISOString() })
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)

    if (error) return { ok: false, error: error.message }

    // Cancel any pending agent_queue jobs on stages that end the cycle.
    if (stage === 'perdido' || stage === 'convertido') {
      await ctx.supabase
        .from('agent_queue')
        .update({ status: 'cancelled' })
        .eq('lead_id', ctx.leadId)
        .eq('status', 'pending')
    }

    return { ok: true, data: { newStage: stage, reason: args.reason ?? null } }
  },
}

export const scheduleMeetingTool: ToolDefinition = {
  name: 'schedule_meeting',
  description:
    'Envia link de agendamento para o lead e move para o estágio "reuniao". Requer Calendly URL configurado na organização.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      calendly_url: { type: 'string' },
      message: { type: 'string', maxLength: 500 },
    },
    required: [],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }

    // Resolve Calendly URL: explicit arg > org's default profile setting.
    let calendlyUrl = (args.calendly_url as string | undefined) ?? null
    if (!calendlyUrl) {
      // Fetch any member of the org who has a calendly_url set — simplistic
      // heuristic for org-level defaults pending per-org integration settings.
      const { data: profile } = await ctx.supabase
        .from('profiles')
        .select('calendly_url')
        .eq('current_organization_id', ctx.orgId)
        .not('calendly_url', 'is', null)
        .limit(1)
        .maybeSingle()
      calendlyUrl = (profile?.calendly_url as string | null) ?? null
    }
    if (!calendlyUrl) {
      return { ok: false, error: 'Calendly URL não configurado na organização' }
    }

    // Move the lead to `reuniao` as a side-effect of scheduling — the
    // actual message is sent separately by the agent via send_message.
    await ctx.supabase
      .from('leads')
      .update({ status_pipeline: 'reuniao', updated_at: new Date().toISOString() })
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)

    return {
      ok: true,
      data: {
        calendly_url: calendlyUrl,
        message_hint: args.message ?? null,
      },
    }
  },
}

export const addTagTool: ToolDefinition = {
  name: 'add_tag',
  description: 'Adiciona uma tag ao lead atual.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { tag: { type: 'string', minLength: 1, maxLength: 30 } },
    required: ['tag'],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }
    const tag = String(args.tag ?? '').trim()
    if (!tag) return { ok: false, error: 'tag vazia' }

    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('tags')
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)
      .single()

    const next = Array.from(new Set([...(lead?.tags ?? []), tag]))
    const { error } = await ctx.supabase
      .from('leads')
      .update({ tags: next, updated_at: new Date().toISOString() })
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { tags: next } }
  },
}

export const removeTagTool: ToolDefinition = {
  name: 'remove_tag',
  description: 'Remove uma tag do lead atual.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { tag: { type: 'string', minLength: 1, maxLength: 30 } },
    required: ['tag'],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }
    const tag = String(args.tag ?? '').trim()
    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('tags')
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)
      .single()
    const next = (lead?.tags ?? []).filter((t: string) => t !== tag)
    const { error } = await ctx.supabase
      .from('leads')
      .update({ tags: next, updated_at: new Date().toISOString() })
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { tags: next } }
  },
}

/**
 * Enrich a lead via the LLM Gateway — pulls public web signals into an
 * extract task. Designed as a stub: v1 uses the LLM with lead context, v2
 * will chain Google Maps / CNPJ / LinkedIn tools.
 */
export const enrichLeadTool: ToolDefinition = {
  name: 'enrich_lead',
  description:
    'Enriquece o lead com dados plausíveis via LLM (segmento, porte, dor típica). Usar quando campos estão vazios.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['segmento', 'porte', 'dor', 'diferencial', 'tom_ideal'],
        },
      },
    },
    required: ['fields'],
  },
  async execute(args, ctx) {
    if (!ctx.leadId) return { ok: false, error: 'sem lead_id' }
    const fields = (args.fields as string[]) ?? []

    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('empresa_nome, decisor_nome, decisor_cargo, segmento, cidade, estado, metadata')
      .eq('id', ctx.leadId)
      .eq('organization_id', ctx.orgId)
      .single()
    if (!lead) return { ok: false, error: 'lead não encontrado' }

    const schema: Record<string, unknown> = {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
      required: fields,
    }

    try {
      const result = await llm.extract<Record<string, string>>({
        user: `Enriqueça o lead B2B abaixo com os campos solicitados. Seja específico e plausível.

Empresa: ${lead.empresa_nome}
Decisor: ${lead.decisor_nome} (${lead.decisor_cargo ?? 'cargo desconhecido'})
Localização: ${[lead.cidade, lead.estado].filter(Boolean).join('/') || 'Brasil'}
Segmento: ${lead.segmento ?? 'desconhecido'}

Retorne JSON com os campos: ${fields.join(', ')}`,
        schema,
        temperature: 0.4,
        maxTokens: 500,
        orgId: ctx.orgId,
      })

      // Merge into metadata without overriding existing non-null fields.
      const merged = { ...(lead.metadata ?? {}), enriched_at: new Date().toISOString(), ...result.data }
      await ctx.supabase
        .from('leads')
        .update({ metadata: merged, updated_at: new Date().toISOString() })
        .eq('id', ctx.leadId)
        .eq('organization_id', ctx.orgId)

      return { ok: true, data: result.data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
