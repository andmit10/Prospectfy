/**
 * Enqueuer — runs on a cron schedule (every hour via Railway or node-cron).
 * Scans agent_queue for pending rows and pushes them into BullMQ.
 */
import { Queue } from 'bullmq'
import cron from 'node-cron'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchPendingJobs } from '@/server/services/agent-queue'
import type { AgentJobData } from './worker'

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
}

const agentQueue = new Queue<AgentJobData>('agent-jobs', {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

async function enqueuePendingJobs() {
  const supabase = createServiceClient()
  const jobs = await fetchPendingJobs(supabase)

  if (jobs.length === 0) {
    console.log('[enqueuer] No pending jobs')
    return
  }

  console.log(`[enqueuer] Enqueuing ${jobs.length} jobs`)

  await Promise.all(
    jobs.map((job) =>
      agentQueue.add(
        `lead-${job.lead_id}-step-${job.step_id}`,
        {
          queue_job_id: job.id,
          lead_id: job.lead_id,
          campaign_id: job.campaign_id,
          step_id: job.step_id,
          attempts: job.attempts,
        },
        {
          jobId: `qjob-${job.id}`, // deduplicate by DB row id
        }
      )
    )
  )

  console.log(`[enqueuer] Done — ${jobs.length} jobs pushed to BullMQ`)
}

// Run every hour at :00
cron.schedule('0 * * * *', () => {
  enqueuePendingJobs().catch((err) =>
    console.error('[enqueuer] Error:', err.message)
  )
})

// Run once on startup too
enqueuePendingJobs().catch((err) =>
  console.error('[enqueuer] Startup error:', err.message)
)

console.log('[enqueuer] Cron started — running every hour')
