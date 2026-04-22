import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchPendingJobs } from '@/server/services/agent-queue'
import { Queue } from 'bullmq'
import type { AgentJobData } from '@workers/worker'

/**
 * Hourly cron — enqueues pending agent jobs from `agent_queue` into BullMQ
 * so the Railway worker can pick them up.
 *
 * Dual-driver: called by both Vercel Cron (GET + Authorization: Bearer)
 * AND GitHub Actions (POST + x-cron-secret). Either works; both are
 * validated against the same CRON_SECRET env var.
 *
 * Redis handling: when REDIS_URL isn't configured (MVP runs without a
 * worker — that's by design per docs/tasks/todo.md), we short-circuit
 * with a 200 + `skipped: true` so the scheduler stays green. As soon as
 * REDIS_URL lands, enqueue starts happening without a code change.
 */

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request): Promise<Response> {
  // Accept either auth header style the two cron drivers use.
  const cronSecret = process.env.CRON_SECRET
  const bearer = request.headers.get('authorization')
  const custom = request.headers.get('x-cron-secret')
  const match =
    (bearer && bearer === `Bearer ${cronSecret}`) ||
    (custom && custom === cronSecret)
  if (cronSecret && !match) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // No Redis = no worker = nothing to enqueue. Don't treat that as failure.
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return NextResponse.json({
      skipped: true,
      reason: 'REDIS_URL not configured — worker disabled',
    })
  }

  const connection = new (await import('ioredis')).default(redisUrl)
  const agentQueue = new Queue<AgentJobData>('agent-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  })

  try {
    const supabase = createServiceClient()
    const jobs = await fetchPendingJobs(supabase)

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
          { jobId: `qjob-${job.id}` }
        )
      )
    )

    return NextResponse.json({ enqueued: jobs.length })
  } finally {
    await agentQueue.close()
    connection.disconnect()
  }
}
