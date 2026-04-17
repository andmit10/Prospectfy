import { Worker, Queue, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { createServiceClient } from '@/lib/supabase/service'
import { generateSuggestionsForOrg } from '@/lib/agents/suggestions'

/**
 * BullMQ worker that generates AI agent suggestions per org. Consumer for
 * queue `agent-suggestions`. The scheduler (running nightly, currently via
 * Vercel cron hitting `/api/cron/agent-suggestions`) enqueues one job per
 * active organization; this consumer fans them out with low concurrency so
 * we don't blow the LLM budget.
 */

const QUEUE = 'agent-suggestions'

type Payload = { orgId: string }

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  console.warn('[agent-suggestions] REDIS_URL not set — worker disabled')
} else {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<Payload>(
    QUEUE,
    async (job: Job<Payload>) => {
      const result = await generateSuggestionsForOrg(job.data.orgId)
      return result
    },
    {
      connection,
      concurrency: 2,
    }
  )

  worker.on('completed', (job, result) => {
    console.log(
      `[agent-suggestions] org ${job.data.orgId}: ${result.inserted} suggestions inserted`
    )
  })

  worker.on('failed', (job, err) => {
    console.error(`[agent-suggestions] org ${job?.data.orgId} failed:`, err.message)
  })

  console.log('[agent-suggestions] worker started')
}

// Exported so a cron endpoint can enqueue for every active org in one shot.
export async function enqueueForAllActiveOrgs(): Promise<number> {
  if (!REDIS_URL) return 0
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
  const queue = new Queue<Payload>(QUEUE, { connection })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .is('suspended_at', null)

  const ids = (data ?? []).map((r) => r.id as string)
  await Promise.all(
    ids.map((orgId) =>
      queue.add('generate', { orgId }, { removeOnComplete: { age: 3600 } })
    )
  )
  return ids.length
}
