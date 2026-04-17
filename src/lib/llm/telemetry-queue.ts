import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { createServiceClient } from '@/lib/supabase/service'
import type { LlmTelemetryPayload } from './types'

/**
 * Fire-and-forget telemetry queue. The router calls `enqueueTelemetry` after
 * every LLM attempt; the worker (in `workers/llm-telemetry-worker.ts`)
 * flushes rows to `llm_telemetry`.
 *
 * When Redis isn't reachable we fall back to a synchronous insert using the
 * service client so a Redis outage doesn't silently drop all usage data.
 */

export const LLM_TELEMETRY_QUEUE = 'llm-telemetry'

let _queue: Queue<LlmTelemetryPayload> | null = null
let _queueFailed = false

function getQueue(): Queue<LlmTelemetryPayload> | null {
  if (_queue || _queueFailed) return _queue
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    _queueFailed = true
    return null
  }
  try {
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    connection.on('error', () => {
      // Let jobs retry in-process rather than crashing the gateway.
    })
    _queue = new Queue<LlmTelemetryPayload>(LLM_TELEMETRY_QUEUE, { connection })
    return _queue
  } catch {
    _queueFailed = true
    return null
  }
}

async function directInsert(payload: LlmTelemetryPayload): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('llm_telemetry').insert({
    org_id: payload.orgId,
    user_id: payload.userId,
    agent_id: payload.agentId,
    task: payload.task,
    model_id: payload.modelId,
    request_id: payload.requestId,
    latency_ms: payload.latencyMs,
    tokens_in: payload.tokensIn,
    tokens_out: payload.tokensOut,
    schema_valid: payload.schemaValid,
    fallback_used: payload.fallbackUsed,
    fallback_reason: payload.fallbackReason,
    error: payload.error,
    cost_usd: payload.costUsd,
    metadata: payload.metadata ?? {},
  })
}

export async function enqueueTelemetry(payload: LlmTelemetryPayload): Promise<void> {
  const q = getQueue()
  if (q) {
    await q.add('telemetry', payload, {
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })
    return
  }
  // Redis unavailable — write straight through. Best effort; never throw.
  try {
    await directInsert(payload)
  } catch (err) {
    console.warn('[llm/telemetry] direct insert failed', err)
  }
}

/**
 * Worker-side handler. Exposed so `workers/llm-telemetry-worker.ts` can
 * call it; keeps the insert logic in one place.
 */
export async function processTelemetryJob(payload: LlmTelemetryPayload): Promise<void> {
  await directInsert(payload)
}
