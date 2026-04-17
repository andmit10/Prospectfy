import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import {
  LLM_TELEMETRY_QUEUE,
  processTelemetryJob,
} from '@/lib/llm/telemetry-queue'
import type { LlmTelemetryPayload } from '@/lib/llm/types'

/**
 * BullMQ consumer for LLM telemetry events. Runs on the same process as the
 * prospecting worker (registered via `workers/index.ts`). Concurrency is high
 * because these jobs are tiny DB inserts — we can drain thousands per second
 * and don't want to backlog the gateway.
 *
 * Failed jobs retry up to 3 times (configured on the producer side). After
 * that they're kept for 24h in `failed` for debugging.
 */

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  // Telemetry can still work via the direct-insert fallback in
  // `telemetry-queue.ts`, so we don't throw — just log and skip the worker.
  console.warn('[llm-telemetry] REDIS_URL not set — worker disabled, inserts will fall back to direct mode')
} else {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<LlmTelemetryPayload>(
    LLM_TELEMETRY_QUEUE,
    async (job: Job<LlmTelemetryPayload>) => {
      await processTelemetryJob(job.data)
    },
    {
      connection,
      concurrency: 20,
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[llm-telemetry] job ${job?.id} failed:`, err.message)
  })

  console.log('[llm-telemetry] BullMQ telemetry worker started')
}
