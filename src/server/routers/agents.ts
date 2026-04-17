import { z } from 'zod'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { TRPCError } from '@trpc/server'
import {
  router,
  orgProcedure,
  writerProcedure,
  adminProcedure,
} from '@/lib/trpc'
import {
  AgentDefinitionSchema,
  buildSystemPromptFromDefinition,
  compileFromDescription,
  type AgentDefinition,
} from '@/lib/agents'

/**
 * Agents router — CRUD + compile + execute + metrics. Most procedures live
 * on `writerProcedure` (org members can author agents); deletion is
 * admin-only to avoid accidental loss of production agents.
 *
 * Execution is dispatched asynchronously via BullMQ queue `agent-execute`
 * so tRPC mutations return immediately with a `runId` the UI can poll.
 */

export const AGENT_EXECUTE_QUEUE = 'agent-execute'

let _execQueue: Queue | null = null
function getExecQueue(): Queue {
  if (_execQueue) return _execQueue
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL not set — agent execution requires BullMQ')
  }
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
  _execQueue = new Queue(AGENT_EXECUTE_QUEUE, { connection })
  return _execQueue
}

const STEP_SCHEMA = z.record(z.string(), z.unknown())

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `agent-${Date.now().toString(36)}`
}

export const agentsRouter = router({
  // ── Templates (global catalog) ─────────────────────────────────────────
  templates: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('agent_templates')
      .select('id, name, description, category, definition, icon_name, tags')
      .eq('enabled', true)
      .order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  }),

  // ── List agents + today's metrics joined ───────────────────────────────
  list: orgProcedure.query(async ({ ctx }) => {
    const today = new Date().toISOString().slice(0, 10)

    const [agentsRes, metricsRes] = await Promise.all([
      ctx.supabase
        .from('agents')
        .select(
          'id, slug, name, description, category, status, tools, channels, kb_ids, trigger_type, cron_expression, updated_at, definition'
        )
        .eq('organization_id', ctx.orgId)
        .order('updated_at', { ascending: false }),
      ctx.supabase
        .from('agent_metrics')
        .select('agent_id, executions, successes, failures, responses, meetings, avg_latency_ms, total_tokens, total_cost_usd')
        .eq('organization_id', ctx.orgId)
        .gte('period_date', new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)),
    ])

    if (agentsRes.error) throw agentsRes.error

    // Aggregate metrics last 30d per agent.
    const byAgent: Record<
      string,
      {
        executions: number
        successes: number
        failures: number
        responses: number
        meetings: number
        avgLatencyMs: number
        tokens: number
        costUsd: number
      }
    > = {}
    for (const row of metricsRes.data ?? []) {
      const id = row.agent_id as string
      const e = byAgent[id] ?? {
        executions: 0,
        successes: 0,
        failures: 0,
        responses: 0,
        meetings: 0,
        avgLatencyMs: 0,
        tokens: 0,
        costUsd: 0,
      }
      const prev = e.executions
      e.executions += row.executions as number
      e.successes += row.successes as number
      e.failures += row.failures as number
      e.responses += row.responses as number
      e.meetings += row.meetings as number
      e.avgLatencyMs = prev + (row.executions as number) > 0
        ? Math.round(
            (e.avgLatencyMs * prev + (row.avg_latency_ms as number) * (row.executions as number)) /
              Math.max(1, prev + (row.executions as number))
          )
        : 0
      e.tokens += Number(row.total_tokens ?? 0)
      e.costUsd += Number(row.total_cost_usd ?? 0)
      byAgent[id] = e
    }

    return (agentsRes.data ?? []).map((a) => ({
      ...a,
      metrics30d: byAgent[a.id as string] ?? {
        executions: 0,
        successes: 0,
        failures: 0,
        responses: 0,
        meetings: 0,
        avgLatencyMs: 0,
        tokens: 0,
        costUsd: 0,
      },
    }))
    // today metric unused here but fetched for future UI; suppress unused-let.
    void today
  }),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('agents')
        .select('*')
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error) throw error
      return data
    }),

  /**
   * Compile a description in natural language into an AgentDefinition.
   * Returns the compiled DSL WITHOUT creating the agent — the UI then
   * shows a preview and the user clicks "Criar" to persist.
   *
   * This is the high-volume hot path for the local LLM.
   */
  compile: writerProcedure
    .input(
      z.object({
        description: z.string().min(10).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Gather ambient context: org's KBs + pipeline stages.
      const [{ data: kbs }, { data: defaultPipeline }] = await Promise.all([
        ctx.supabase
          .from('knowledge_bases')
          .select('id, name')
          .eq('organization_id', ctx.orgId),
        ctx.supabase
          .from('pipelines')
          .select('stages')
          .eq('organization_id', ctx.orgId)
          .eq('is_default', true)
          .maybeSingle(),
      ])

      const stages =
        (defaultPipeline?.stages as string[] | undefined) ??
        ['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido']

      const result = await compileFromDescription({
        description: input.description,
        availableKbs: (kbs ?? []) as Array<{ id: string; name: string }>,
        pipelineStages: stages,
        orgId: ctx.orgId,
        userId: ctx.user.id,
      })

      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error })
      }
      return {
        definition: result.definition,
        modelId: result.modelId,
        requestId: result.requestId,
      }
    }),

  /**
   * Create an agent from a compiled definition (or a template clone).
   * Validates the definition server-side again — we never trust anything
   * the client hands us.
   */
  create: writerProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        description: z.string().max(400).optional(),
        category: z
          .enum([
            'prospecting',
            'qualifying',
            'enrichment',
            'outreach',
            'follow_up',
            'customer_success',
            'analysis',
            'whatsapp',
            'custom',
          ])
          .default('custom'),
        definition: STEP_SCHEMA,
        status: z.enum(['draft', 'active', 'paused']).default('draft'),
        fromTemplate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const validated = AgentDefinitionSchema.safeParse(input.definition)
      if (!validated.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Definição inválida: ${validated.error.issues[0]?.message}`,
        })
      }
      const def: AgentDefinition = validated.data

      // Derive caches persisted on the row.
      const systemPrompt = buildSystemPromptFromDefinition(def, {
        agentName: input.name,
        companyName: 'sua empresa',
      })

      // Slug: take from name with collision dedup.
      let slug = slugify(input.name)
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: existing } = await ctx.supabase
          .from('agents')
          .select('id')
          .eq('organization_id', ctx.orgId)
          .eq('slug', slug)
          .maybeSingle()
        if (!existing) break
        slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 5)}`
      }

      const { data, error } = await ctx.supabase
        .from('agents')
        .insert({
          organization_id: ctx.orgId,
          name: input.name,
          slug,
          description: input.description ?? null,
          category: input.category,
          status: input.status,
          definition: def,
          system_prompt: systemPrompt,
          tools: def.tools,
          channels: def.channels,
          kb_ids: def.kb_ids,
          trigger_type: def.trigger.type,
          trigger_config: def.trigger,
          cron_expression: def.trigger.type === 'cron' ? def.trigger.cron_expression : null,
          cron_timezone: def.trigger.type === 'cron' ? def.trigger.timezone : null,
          created_by: ctx.user.id,
          created_from_template: input.fromTemplate ?? null,
        })
        .select('id, slug')
        .single()

      if (error) throw error
      return data
    }),

  /**
   * Update a subset of fields. Passing a new `definition` re-validates and
   * rebuilds the cached system_prompt + whitelists.
   */
  update: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(400).nullable().optional(),
        category: z
          .enum([
            'prospecting',
            'qualifying',
            'enrichment',
            'outreach',
            'follow_up',
            'customer_success',
            'analysis',
            'whatsapp',
            'custom',
          ])
          .optional(),
        status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
        definition: STEP_SCHEMA.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (input.name !== undefined) patch.name = input.name
      if (input.description !== undefined) patch.description = input.description
      if (input.category !== undefined) patch.category = input.category
      if (input.status !== undefined) patch.status = input.status

      if (input.definition !== undefined) {
        const validated = AgentDefinitionSchema.safeParse(input.definition)
        if (!validated.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Definição inválida: ${validated.error.issues[0]?.message}`,
          })
        }
        const def = validated.data
        patch.definition = def
        patch.tools = def.tools
        patch.channels = def.channels
        patch.kb_ids = def.kb_ids
        patch.trigger_type = def.trigger.type
        patch.trigger_config = def.trigger
        patch.cron_expression =
          def.trigger.type === 'cron' ? def.trigger.cron_expression : null
        patch.cron_timezone = def.trigger.type === 'cron' ? def.trigger.timezone : null
        patch.system_prompt = buildSystemPromptFromDefinition(def, {
          agentName: (input.name as string) ?? 'agente',
          companyName: 'sua empresa',
        })
      }

      const { data, error } = await ctx.supabase
        .from('agents')
        .update(patch)
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .select('id')
        .single()

      if (error) throw error
      return data
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('agents')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
      if (error) throw error
      return { success: true }
    }),

  duplicate: writerProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(2).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { data: src, error } = await ctx.supabase
        .from('agents')
        .select('*')
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error || !src) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agente não encontrado' })
      }
      const { data, error: insertErr } = await ctx.supabase
        .from('agents')
        .insert({
          organization_id: ctx.orgId,
          name: input.name,
          slug: slugify(input.name),
          description: src.description,
          category: src.category,
          status: 'draft',
          definition: src.definition,
          system_prompt: src.system_prompt,
          tools: src.tools,
          channels: src.channels,
          kb_ids: src.kb_ids,
          trigger_type: src.trigger_type,
          trigger_config: src.trigger_config,
          cron_expression: src.cron_expression,
          cron_timezone: src.cron_timezone,
          created_by: ctx.user.id,
        })
        .select('id, slug')
        .single()
      if (insertErr) throw insertErr
      return data
    }),

  /**
   * Manually trigger an execution. Enqueues a BullMQ job; returns
   * immediately with a `runId` placeholder that the worker fills in.
   */
  execute: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        leadId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Confirm ownership.
      const { data: agent } = await ctx.supabase
        .from('agents')
        .select('id, status')
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .maybeSingle()
      if (!agent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agente não encontrado' })
      }
      if (agent.status === 'archived') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Agente arquivado' })
      }

      const queue = getExecQueue()
      const job = await queue.add(
        'execute',
        {
          agentId: input.id,
          orgId: ctx.orgId,
          leadId: input.leadId ?? null,
          trigger: 'manual',
          triggerMetadata: { invokedBy: ctx.user.id },
        },
        {
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
          attempts: 1,
        }
      )
      return { queuedJobId: job.id ?? null }
    }),

  /** List recent runs for an agent (tail, newest first). */
  recentRuns: orgProcedure
    .input(z.object({ agentId: z.string().uuid(), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('agent_runs')
        .select(
          'id, lead_id, trigger, status, started_at, ended_at, latency_ms, tokens_used, cost_usd, outcome, error'
        )
        .eq('agent_id', input.agentId)
        .eq('organization_id', ctx.orgId)
        .order('started_at', { ascending: false })
        .limit(input.limit)
      if (error) throw error
      return data ?? []
    }),

  runDetail: orgProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('agent_runs')
        .select('*')
        .eq('id', input.runId)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error) throw error
      return data
    }),

  // ── Suggestions ────────────────────────────────────────────────────────
  suggestions: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('agent_suggestions')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('status', 'pending')
      .order('score', { ascending: false })
      .limit(5)
    if (error) throw error
    return data ?? []
  }),

  actSuggestion: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        action: z.enum(['accepted', 'dismissed']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('agent_suggestions')
        .update({
          status: input.action,
          acted_at: new Date().toISOString(),
          acted_by: ctx.user.id,
        })
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
      if (error) throw error
      return { success: true }
    }),
})
