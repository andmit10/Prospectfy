import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { executeAgent } from '@/lib/agents'
import { childLogger } from '@/lib/logger'

const log = childLogger('worker:agent-executor')

const QUEUE = 'agent-execute'

type Payload = {
  agentId: string
  orgId: string
  leadId?: string | null
  trigger:
    | 'manual'
    | 'cron'
    | 'response_received'
    | 'pipeline_stage_change'
    | 'lead_created'
    | 'webhook'
  triggerMetadata?: Record<string, unknown>
}

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  log.warn('REDIS_URL not set — worker disabled')
} else {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<Payload>(
    QUEUE,
    async (job: Job<Payload>) => {
      const p = job.data
      const result = await executeAgent({
        agentId: p.agentId,
        orgId: p.orgId,
        leadId: p.leadId ?? null,
        trigger: p.trigger,
        triggerMetadata: p.triggerMetadata ?? {},
      })
      return result
    },
    {
      connection,
      // Moderate — agent loops can be expensive (RAG + multiple LLM calls).
      concurrency: 5,
    }
  )

  worker.on('completed', (job, result) => {
    log.info('agent run completed', {
      jobId: job.id,
      runId: result.runId,
      status: result.status,
      tokens: result.tokensUsed,
      costUsd: Number(result.costUsd.toFixed(4)),
    })
  })

  worker.on('failed', (job, err) => {
    log.error('agent run failed', {
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    })
  })

  log.info('agent executor worker started', { concurrency: 5 })
}
