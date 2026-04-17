import { createServiceClient } from '@/lib/supabase/service'
import { llm } from '@/lib/llm'
import { retrieveAsWorker } from '@/lib/rag'
import {
  AgentDefinitionSchema,
  buildSystemPromptFromDefinition,
  type AgentStep,
} from './definition'
import { buildRunContext, interpolate, resolvePath } from './context-builder'
import { getTool } from './tools'
// Ensure every tool is registered by the time the runtime imports.
import './tools'

/**
 * Agent runtime — executes an AgentDefinition against a lead (or without one).
 *
 * Execution model:
 *   1. Load agent + definition (validate via Zod at load time as safety net).
 *   2. Insert agent_runs row in `running`.
 *   3. Build RunContext (lead snapshot + history + optional KB pre-fetch).
 *   4. Walk `definition.steps` in order, with support for nested conditionals.
 *      Each step updates `ctx.vars` and appends to `step_trace`.
 *   5. Finalize agent_runs — status success/failed, ended_at, tokens, reasoning.
 *
 * Safety:
 *   - Tool whitelist enforced at dispatch AND inside each tool.
 *   - Channel whitelist enforced in `send_message`.
 *   - KB whitelist enforced in retrieval steps + search_knowledge.
 *   - Max 30 steps expanded (hard stop), max 10 conditional depth.
 *   - tool_call failures are NON-FATAL by default (status stays running);
 *     an `end` step or an LLM task returning `stop: true` terminates.
 */

const MAX_STEP_EXPANSIONS = 30
const MAX_CONDITIONAL_DEPTH = 10
const MAX_TOOL_CALL_LOG_BYTES = 64 * 1024

type ExecuteOptions = {
  agentId: string
  orgId: string
  leadId?: string | null
  trigger: 'manual' | 'cron' | 'response_received' | 'pipeline_stage_change' | 'lead_created' | 'webhook'
  triggerMetadata?: Record<string, unknown>
}

export type ExecuteResult = {
  runId: string
  status: 'success' | 'failed' | 'cancelled' | 'skipped'
  outcome?: string
  tokensUsed: number
  costUsd: number
  error?: string
}

type StepTrace = {
  index: number
  type: string
  summary: string
  durationMs: number
  tokens?: number
  error?: string
}

type ToolCallLogEntry = {
  tool: string
  args: Record<string, unknown>
  result: unknown
  durationMs: number
  ok: boolean
  error?: string
}

export async function executeAgent(opts: ExecuteOptions): Promise<ExecuteResult> {
  const supabase = createServiceClient()

  // 0. Trial gate — expired trials must not send outbound messages. The
  // lead-generation quota is enforced on the /generate endpoint separately.
  // We intentionally still allow manual runs so the user can dry-run their
  // agent copy, but cron/webhook/response triggers are blocked.
  if (opts.trigger !== 'manual') {
    const { getTrialStatus } = await import('@/lib/trial/limits')
    const trial = await getTrialStatus(supabase, opts.orgId)
    if (trial.expired) {
      return {
        runId: '',
        status: 'skipped',
        tokensUsed: 0,
        costUsd: 0,
        error: 'Trial expirado — faça upgrade para retomar os envios.',
      }
    }
  }

  // 1. Load agent + validate definition.
  const { data: agentRow, error: loadErr } = await supabase
    .from('agents')
    .select('id, organization_id, name, status, definition, system_prompt, tools, channels, kb_ids, llm_task')
    .eq('id', opts.agentId)
    .eq('organization_id', opts.orgId)
    .single()

  if (loadErr || !agentRow) {
    throw new Error('Agente não encontrado')
  }
  if (agentRow.status !== 'active' && opts.trigger !== 'manual') {
    return {
      runId: '',
      status: 'skipped',
      tokensUsed: 0,
      costUsd: 0,
      error: `Agente em status "${agentRow.status}"`,
    }
  }

  const parsed = AgentDefinitionSchema.safeParse(agentRow.definition)
  if (!parsed.success) {
    // Record a failed run so the user sees why.
    const { data: runRow } = await supabase
      .from('agent_runs')
      .insert({
        agent_id: agentRow.id,
        organization_id: agentRow.organization_id,
        lead_id: opts.leadId ?? null,
        trigger: opts.trigger,
        trigger_metadata: opts.triggerMetadata ?? {},
        status: 'failed',
        error: `DSL inválida: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        ended_at: new Date().toISOString(),
        latency_ms: 0,
      })
      .select('id')
      .single()
    return {
      runId: (runRow?.id as string) ?? '',
      status: 'failed',
      tokensUsed: 0,
      costUsd: 0,
      error: 'DSL inválida',
    }
  }
  const definition = parsed.data

  // 2. Open agent_runs row.
  const startedAt = Date.now()
  const { data: runInsert, error: insertErr } = await supabase
    .from('agent_runs')
    .insert({
      agent_id: agentRow.id,
      organization_id: agentRow.organization_id,
      lead_id: opts.leadId ?? null,
      trigger: opts.trigger,
      trigger_metadata: opts.triggerMetadata ?? {},
      status: 'running',
    })
    .select('id')
    .single()

  if (insertErr || !runInsert) {
    throw new Error(`Falha ao registrar run: ${insertErr?.message}`)
  }
  const runId = runInsert.id as string

  // 3. Build run context.
  const systemPrompt =
    agentRow.system_prompt ??
    buildSystemPromptFromDefinition(definition, {
      agentName: agentRow.name as string,
      companyName: 'nossa empresa',
    })

  const ctx = await buildRunContext({
    supabase,
    orgId: opts.orgId,
    agentId: agentRow.id as string,
    runId,
    leadId: opts.leadId ?? null,
    tools: (agentRow.tools as string[]) ?? [],
    channels: (agentRow.channels as string[]) ?? [],
    kbIds: (agentRow.kb_ids as string[]) ?? [],
  })

  // Make lead fields available for interpolation by their bare names too.
  if (ctx.lead) ctx.vars.lead = ctx.lead

  // 4. Execute the DSL.
  const stepTrace: StepTrace[] = []
  const toolCallLog: ToolCallLogEntry[] = []
  const reasoningParts: string[] = []
  let tokensUsed = 0
  let costUsd = 0
  let outcome: string | undefined
  let terminalError: string | undefined
  let remainingExpansions = MAX_STEP_EXPANSIONS

  async function runStep(step: AgentStep, depth: number, index: number): Promise<'continue' | 'end'> {
    if (remainingExpansions-- <= 0) {
      terminalError = 'Limite de steps excedido'
      return 'end'
    }
    const t0 = Date.now()

    try {
      switch (step.type) {
        case 'llm_task': {
          const prompt = interpolate(step.user, { ...ctx.vars, lead: ctx.lead })
          const full = systemPrompt + (ctx.knowledgeContext ? `\n\n${ctx.knowledgeContext}` : '')
          if (step.task === 'chat') {
            const r = await llm.chat({
              system: full,
              user: prompt,
              orgId: ctx.orgId,
              agentId: ctx.agentId,
            })
            ctx.vars[step.output_var] = { text: r.response.content }
            tokensUsed += r.response.tokensOut + r.response.tokensIn
            costUsd += r.response.costUsd
            reasoningParts.push(r.response.content.slice(0, 500))
          } else if (step.task === 'sequence') {
            const r = await llm.sequence({
              system: full,
              user: prompt,
              orgId: ctx.orgId,
              agentId: ctx.agentId,
            })
            ctx.vars[step.output_var] = r.parsed ?? { message: r.response.content }
            tokensUsed += r.response.tokensOut + r.response.tokensIn
            costUsd += r.response.costUsd
          } else if (step.task === 'classify') {
            const r = await llm.classify({
              system: step.system,
              user: prompt,
              orgId: ctx.orgId,
              agentId: ctx.agentId,
              schema: step.schema,
            })
            ctx.vars[step.output_var] = r.data
          } else if (step.task === 'extract') {
            if (!step.schema) {
              stepTrace.push({
                index,
                type: step.type,
                summary: 'extract sem schema',
                durationMs: Date.now() - t0,
                error: 'missing schema',
              })
              return 'continue'
            }
            const r = await llm.extract({
              system: step.system,
              user: prompt,
              schema: step.schema,
              orgId: ctx.orgId,
              agentId: ctx.agentId,
            })
            ctx.vars[step.output_var] = r.data
          }
          stepTrace.push({
            index,
            type: step.type,
            summary: `${step.task} → ${step.output_var}`,
            durationMs: Date.now() - t0,
          })
          return 'continue'
        }

        case 'retrieve': {
          if (ctx.allowedKbIds.length === 0) {
            stepTrace.push({
              index,
              type: step.type,
              summary: 'retrieve sem KBs vinculadas',
              durationMs: Date.now() - t0,
            })
            return 'continue'
          }
          const rawQuery = resolvePath({ ...ctx.vars, lead: ctx.lead }, step.query_var)
          const query = typeof rawQuery === 'string' ? rawQuery : String(rawQuery ?? '')
          const kbIds = (step.kb_ids ?? ctx.allowedKbIds).filter((id: string) =>
            ctx.allowedKbIds.includes(id)
          )
          const pack = await retrieveAsWorker({
            orgId: ctx.orgId,
            kbIds,
            query,
            topK: step.top_k,
          })
          ctx.vars[step.output_var] = {
            contextText: pack.contextText,
            hits: pack.hits,
          }
          stepTrace.push({
            index,
            type: step.type,
            summary: `retrieve ${pack.hits.length} chunks`,
            durationMs: Date.now() - t0,
          })
          return 'continue'
        }

        case 'tool_call': {
          const tool = getTool(step.tool)
          if (!tool) {
            toolCallLog.push({
              tool: step.tool,
              args: step.args,
              result: null,
              durationMs: Date.now() - t0,
              ok: false,
              error: 'tool não registrado',
            })
            stepTrace.push({
              index,
              type: step.type,
              summary: `tool "${step.tool}" não registrado`,
              durationMs: Date.now() - t0,
              error: 'tool não registrado',
            })
            return 'continue'
          }
          if (!ctx.allowedTools.includes(step.tool)) {
            toolCallLog.push({
              tool: step.tool,
              args: step.args,
              result: null,
              durationMs: Date.now() - t0,
              ok: false,
              error: 'fora do whitelist',
            })
            stepTrace.push({
              index,
              type: step.type,
              summary: `tool "${step.tool}" fora do whitelist`,
              durationMs: Date.now() - t0,
              error: 'fora do whitelist',
            })
            return 'continue'
          }

          // Resolve interpolated args — strings with `{var.path}` OR
          // explicit `*_var` keys that point to a var reference.
          const resolvedArgs: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(step.args ?? {})) {
            if (typeof v === 'string') {
              resolvedArgs[k] = interpolate(v, { ...ctx.vars, lead: ctx.lead })
            } else {
              resolvedArgs[k] = v
            }
          }
          // Convenience: *_var keys resolve to the var's raw value.
          for (const [k, v] of Object.entries(step.args ?? {})) {
            if (k.endsWith('_var') && typeof v === 'string') {
              const realKey = k.slice(0, -4)
              resolvedArgs[realKey] = resolvePath({ ...ctx.vars, lead: ctx.lead }, v)
            }
          }

          const res = await tool.execute(resolvedArgs, {
            orgId: ctx.orgId,
            agentId: ctx.agentId,
            runId: ctx.runId,
            leadId: ctx.leadId,
            allowedChannels: ctx.allowedChannels,
            allowedKbIds: ctx.allowedKbIds,
            supabase,
            vars: ctx.vars,
            companyName: ctx.companyName,
          })
          toolCallLog.push({
            tool: step.tool,
            args: resolvedArgs,
            result: res.ok ? res.data : null,
            durationMs: Date.now() - t0,
            ok: res.ok,
            error: res.ok ? undefined : res.error,
          })
          if (step.output_var) {
            ctx.vars[step.output_var] = res.ok ? res.data : { error: res.error }
          }
          stepTrace.push({
            index,
            type: step.type,
            summary: `${step.tool}: ${res.ok ? 'ok' : res.error}`,
            durationMs: Date.now() - t0,
            error: res.ok ? undefined : res.error,
          })
          return 'continue'
        }

        case 'conditional': {
          if (depth >= MAX_CONDITIONAL_DEPTH) {
            terminalError = 'Profundidade de conditional excedida'
            return 'end'
          }
          const truthy = evaluateExpression(step.expression, ctx.vars)
          const branch = truthy ? step.then : step.else
          for (let i = 0; i < branch.length; i++) {
            const ret = await runStep(branch[i], depth + 1, i)
            if (ret === 'end') return 'end'
          }
          stepTrace.push({
            index,
            type: step.type,
            summary: `${step.expression} → ${truthy ? 'then' : 'else'}`,
            durationMs: Date.now() - t0,
          })
          return 'continue'
        }

        case 'wait': {
          // We don't actually sleep in-process — we schedule a continuation
          // via agent_queue so the worker picks up after `hours`.
          // v1: log it and treat as a no-op (Phase 5 wires scheduling).
          stepTrace.push({
            index,
            type: step.type,
            summary: `wait ${step.hours}h (scheduling não implementado em v1)`,
            durationMs: Date.now() - t0,
          })
          return 'continue'
        }

        case 'end': {
          outcome = step.outcome ?? 'manual_end'
          stepTrace.push({
            index,
            type: step.type,
            summary: `end: ${outcome}${step.reason ? ` (${step.reason})` : ''}`,
            durationMs: Date.now() - t0,
          })
          return 'end'
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stepTrace.push({
        index,
        type: (step as AgentStep).type,
        summary: 'exception',
        durationMs: Date.now() - t0,
        error: msg,
      })
      // Exceptions in steps are captured but don't halt the run unless
      // they come from an `end` or exceed the budget.
    }
    return 'continue'
  }

  for (let i = 0; i < definition.steps.length; i++) {
    const ret = await runStep(definition.steps[i], 0, i)
    if (ret === 'end') break
  }

  // 5. Finalize.
  const endedAt = new Date().toISOString()
  const latencyMs = Date.now() - startedAt

  // Cap tool_call log size — agent_runs shouldn't balloon the DB.
  let logJson = JSON.stringify(toolCallLog)
  if (logJson.length > MAX_TOOL_CALL_LOG_BYTES) {
    // Keep the last N entries; the head is the most useful when debugging
    // planning issues, tail when debugging final failure — we keep tail.
    let trimmed = toolCallLog.slice(-20)
    logJson = JSON.stringify(trimmed)
    while (logJson.length > MAX_TOOL_CALL_LOG_BYTES && trimmed.length > 1) {
      trimmed = trimmed.slice(1)
      logJson = JSON.stringify(trimmed)
    }
  }

  await supabase
    .from('agent_runs')
    .update({
      status: terminalError ? 'failed' : 'success',
      ended_at: endedAt,
      latency_ms: latencyMs,
      tokens_used: tokensUsed,
      cost_usd: costUsd,
      tool_calls: JSON.parse(logJson),
      step_trace: stepTrace,
      reasoning: reasoningParts.join('\n\n').slice(0, 8000),
      outcome: outcome ?? null,
      error: terminalError ?? null,
    })
    .eq('id', runId)

  return {
    runId,
    status: terminalError ? 'failed' : 'success',
    outcome,
    tokensUsed,
    costUsd,
    error: terminalError,
  }
}

/**
 * Tiny boolean expression evaluator. Supports:
 *   var >= N, var > N, var == "str", var != "str", var && var, var || !var
 * Paths are resolved from `vars`. Parenthesized grouping NOT supported —
 * kept intentionally small to avoid eval-like surfaces.
 */
function evaluateExpression(expr: string, vars: Record<string, unknown>): boolean {
  const trimmed = expr.trim()
  if (!trimmed) return false

  // Handle a single || top-level
  if (trimmed.includes(' || ')) {
    return trimmed.split(' || ').some((p) => evaluateExpression(p, vars))
  }
  if (trimmed.includes(' && ')) {
    return trimmed.split(' && ').every((p) => evaluateExpression(p, vars))
  }
  const negated = trimmed.startsWith('!')
  const body = negated ? trimmed.slice(1).trim() : trimmed

  // Comparison
  const cmpMatch = body.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/)
  if (cmpMatch) {
    const [, lhsRaw, op, rhsRaw] = cmpMatch
    const lhs = resolvePath(vars, lhsRaw.trim())
    const rhs = coerceLiteral(rhsRaw.trim(), vars)
    const lv = typeof lhs === 'number' || typeof rhs === 'number' ? Number(lhs) : lhs
    const rv = typeof lhs === 'number' || typeof rhs === 'number' ? Number(rhs) : rhs
    let result = false
    if (op === '==') result = lv === rv
    else if (op === '!=') result = lv !== rv
    else if (op === '>') result = Number(lv) > Number(rv)
    else if (op === '<') result = Number(lv) < Number(rv)
    else if (op === '>=') result = Number(lv) >= Number(rv)
    else if (op === '<=') result = Number(lv) <= Number(rv)
    return negated ? !result : result
  }

  // Bare truthy check
  const v = resolvePath(vars, body)
  const truthy = !!v
  return negated ? !truthy : truthy
}

function coerceLiteral(raw: string, vars: Record<string, unknown>): unknown {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return resolvePath(vars, trimmed)
}
