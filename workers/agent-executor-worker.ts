import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { executeAgent } from '@/lib/agents'

/**
 * BullMQ consumer for agent executions. Each job carries the agent id +
 * optional lead id + trigger metadata. The executor handles recording
 * `agent_runs` internally.
 */

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
  console.warn('[agent-executor] REDIS_URL not set — worker disabled')
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
    console.log(
      `[agent-executor] run ${result.runId} ${result.status} — tokens=${result.tokensUsed} cost=$${result.costUsd.toFixed(4)}`
    )
  })

  worker.on('failed', (job, err) => {
    console.error(`[agent-executor] job ${job?.id} failed:`, err.message)
  })

  console.log('[agent-executor] BullMQ agent execution worker started')
}
