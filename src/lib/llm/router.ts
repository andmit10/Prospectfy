import { anthropicProvider } from './providers/anthropic'
import {
  ollamaProvider,
  openaiProvider,
  vllmProvider,
} from './providers/openai-compatible'
import { resolveTaskModels } from './registry'
import { getSchema } from './schemas'
import { validateAgainst } from './validator'
import type {
  LlmCallRequest,
  LlmCallResponse,
  LlmMessage,
  LlmProvider,
  LlmProviderResult,
  LlmTask,
  LlmTelemetryPayload,
  LlmToolSchema,
  LlmProviderId,
} from './types'

/**
 * Task-based LLM router with fallback + telemetry.
 *
 * Call sites never pick models directly — they describe a `task` and the
 * router resolves:
 *   1. Primary model from `llm_routes.primary_model_id` (falls back when
 *      primary is disabled in the catalog).
 *   2. Schema to validate JSON output against (from llm_routes.schema_name).
 *   3. Fallback model when primary fails with a retryable error, JSON schema
 *      fails twice in a row, or latency exceeds LATENCY_BUDGET_MS.
 *   4. Telemetry rows for every attempt (fire-and-forget BullMQ).
 *
 * The router is transport-agnostic: providers implement `LlmProvider.call`
 * and return `{ ok, response }` tuples — no exceptions for expected flows.
 */

const PROVIDERS: Record<LlmProviderId, LlmProvider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  vllm: vllmProvider,
  openai: openaiProvider,
}

const LATENCY_BUDGET_MS = 8000
const MAX_SCHEMA_RETRIES = 2

export type RunTaskInput = {
  task: LlmTask
  messages: LlmMessage[]
  /** Optional context — merged into the user message upstream; router only forwards */
  tools?: LlmToolSchema[]
  /** Override the configured schema (e.g. per-call extract schema) */
  overrideSchema?: Record<string, unknown>
  /** Telemetry attribution */
  orgId?: string | null
  userId?: string | null
  agentId?: string | null
  /** Optional overrides for temperature / max_tokens */
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export type RunTaskResult = {
  response: LlmCallResponse
  parsed: unknown
  schemaValid: boolean | null
  fallbackUsed: boolean
  fallbackReason: string | null
  modelId: string
  requestId: string
}

function shortId(): string {
  return (
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
    '-' +
    Date.now().toString(36)
  )
}

/**
 * Queue a telemetry row. Fire-and-forget — dynamic import so the gateway
 * can run in environments without BullMQ wired (tests). On failure, we log
 * but never throw (telemetry isn't allowed to break the response path).
 */
async function recordTelemetry(payload: LlmTelemetryPayload): Promise<void> {
  try {
    const { enqueueTelemetry } = await import('./telemetry-queue')
    await enqueueTelemetry(payload)
  } catch (err) {
    console.warn('[llm/router] telemetry enqueue failed', err)
  }
}

async function runOnModel(req: LlmCallRequest): Promise<LlmProviderResult> {
  const provider = PROVIDERS[req.model.provider]
  if (!provider) {
    return {
      ok: false,
      error: `No provider registered for ${req.model.provider}`,
      retryable: false,
    }
  }
  return provider.call(req)
}

async function runWithSchemaRetry(
  req: LlmCallRequest,
  schema: Record<string, unknown> | null
): Promise<{
  attempts: number
  last: LlmProviderResult
  parsed: unknown
  schemaValid: boolean | null
}> {
  let attempt = 0
  let last: LlmProviderResult = { ok: false, error: 'not attempted', retryable: false }
  let parsed: unknown = null
  let schemaValid: boolean | null = null

  while (attempt < MAX_SCHEMA_RETRIES + 1) {
    attempt++
    last = await runOnModel(req)
    if (!last.ok) return { attempts: attempt, last, parsed, schemaValid }

    if (!schema) {
      return { attempts: attempt, last, parsed: last.response.content, schemaValid: null }
    }

    const validation = validateAgainst(schema, last.response.content)
    schemaValid = validation.valid
    parsed = validation.data
    if (validation.valid) {
      // Annotate the response in-place so callers see schemaValid = true.
      return { attempts: attempt, last: { ok: true, response: { ...last.response, schemaValid: true } }, parsed, schemaValid: true }
    }

    if (attempt > MAX_SCHEMA_RETRIES) break

    // Append a nudge and retry. We keep the original conversation and tack
    // on a short correction prompt so the next attempt usually succeeds.
    req = {
      ...req,
      messages: [
        ...req.messages,
        { role: 'assistant', content: last.response.content },
        {
          role: 'user',
          content: `Sua resposta anterior não bateu com o JSON Schema esperado. Erro: ${validation.error}. Responda APENAS com JSON válido que siga exatamente o schema — sem texto adicional, sem markdown.`,
        },
      ],
    }
  }

  return { attempts: attempt, last, parsed, schemaValid: false }
}

export async function runTask(input: RunTaskInput): Promise<RunTaskResult> {
  const { primary, fallback, route } = await resolveTaskModels(input.task)
  if (!route) {
    throw new Error(`No route configured for task "${input.task}"`)
  }

  const schema =
    input.overrideSchema ??
    (route.schema_name ? getSchema(route.schema_name) : null)

  const requestId = shortId()

  const commonReq: Omit<LlmCallRequest, 'model'> = {
    task: input.task,
    messages: input.messages,
    temperature: input.temperature ?? route.temperature,
    maxTokens: input.maxTokens ?? route.max_tokens,
    jsonSchema: schema,
    tools: input.tools,
    requestId,
    signal: input.signal,
  }

  // ── Primary attempt ──
  let primaryError: string | null = null
  if (primary) {
    const timeoutController = new AbortController()
    const timeout = setTimeout(() => timeoutController.abort('latency_budget'), LATENCY_BUDGET_MS)
    const req: LlmCallRequest = {
      ...commonReq,
      model: primary,
      signal: input.signal ?? timeoutController.signal,
    }
    const primaryResult = await runWithSchemaRetry(req, schema)
    clearTimeout(timeout)

    if (primaryResult.last.ok && primaryResult.schemaValid !== false) {
      await recordTelemetry({
        orgId: input.orgId ?? null,
        userId: input.userId ?? null,
        agentId: input.agentId ?? null,
        task: input.task,
        modelId: primary.id,
        requestId,
        latencyMs: primaryResult.last.response.latencyMs,
        tokensIn: primaryResult.last.response.tokensIn,
        tokensOut: primaryResult.last.response.tokensOut,
        schemaValid: primaryResult.schemaValid,
        fallbackUsed: false,
        fallbackReason: null,
        error: null,
        costUsd: primaryResult.last.response.costUsd,
      })
      return {
        response: primaryResult.last.response,
        parsed: primaryResult.parsed,
        schemaValid: primaryResult.schemaValid,
        fallbackUsed: false,
        fallbackReason: null,
        modelId: primary.id,
        requestId,
      }
    }

    primaryError = primaryResult.last.ok
      ? 'schema_invalid_after_retries'
      : primaryResult.last.error

    await recordTelemetry({
      orgId: input.orgId ?? null,
      userId: input.userId ?? null,
      agentId: input.agentId ?? null,
      task: input.task,
      modelId: primary.id,
      requestId,
      latencyMs: primaryResult.last.ok ? primaryResult.last.response.latencyMs : 0,
      tokensIn: primaryResult.last.ok ? primaryResult.last.response.tokensIn : 0,
      tokensOut: primaryResult.last.ok ? primaryResult.last.response.tokensOut : 0,
      schemaValid: primaryResult.schemaValid,
      fallbackUsed: false,
      fallbackReason: null,
      error: primaryError,
      costUsd: primaryResult.last.ok ? primaryResult.last.response.costUsd : 0,
    })
  } else {
    primaryError = 'primary_disabled'
  }

  // ── Fallback attempt ──
  if (!fallback) {
    throw new Error(
      `LLM task "${input.task}" primary failed and no fallback configured. Reason: ${primaryError}`
    )
  }

  const req: LlmCallRequest = { ...commonReq, model: fallback }
  const fallbackResult = await runWithSchemaRetry(req, schema)

  await recordTelemetry({
    orgId: input.orgId ?? null,
    userId: input.userId ?? null,
    agentId: input.agentId ?? null,
    task: input.task,
    modelId: fallback.id,
    requestId,
    latencyMs: fallbackResult.last.ok ? fallbackResult.last.response.latencyMs : 0,
    tokensIn: fallbackResult.last.ok ? fallbackResult.last.response.tokensIn : 0,
    tokensOut: fallbackResult.last.ok ? fallbackResult.last.response.tokensOut : 0,
    schemaValid: fallbackResult.schemaValid,
    fallbackUsed: true,
    fallbackReason: primaryError,
    error: fallbackResult.last.ok ? null : fallbackResult.last.error,
    costUsd: fallbackResult.last.ok ? fallbackResult.last.response.costUsd : 0,
  })

  if (!fallbackResult.last.ok) {
    throw new Error(
      `LLM task "${input.task}" failed on both primary (${primaryError}) and fallback (${fallbackResult.last.error}).`
    )
  }

  return {
    response: fallbackResult.last.response,
    parsed: fallbackResult.parsed,
    schemaValid: fallbackResult.schemaValid,
    fallbackUsed: true,
    fallbackReason: primaryError,
    modelId: fallback.id,
    requestId,
  }
}

/**
 * Embedding shortcut — uses the 'embed' route but returns only the vector.
 * Picks the provider based on the route's primary model; no retry-with-
 * schema logic since embeddings never use schemas.
 */
export async function runEmbed(text: string): Promise<{ embedding: number[]; model: string; tokens: number }> {
  const { primary, fallback } = await resolveTaskModels('embed')

  for (const model of [primary, fallback].filter(Boolean) as NonNullable<typeof primary>[]) {
    const provider = PROVIDERS[model.provider]
    if (!provider?.embed) continue
    try {
      const result = await provider.embed(text, model)
      if (result) {
        return { embedding: result.embedding, model: model.id, tokens: result.tokens }
      }
    } catch (err) {
      console.warn(`[llm/router] embed failed on ${model.id}:`, err)
    }
  }

  throw new Error('No embedding provider succeeded')
}
