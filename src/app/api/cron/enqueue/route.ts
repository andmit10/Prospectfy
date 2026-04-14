import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchPendingJobs } from '@/server/services/agent-queue'
import { Queue } from 'bullmq'
import type { AgentJobData } from '@workers/worker'

// Vercel Cron: add to vercel.json → { "crons": [{ "path": "/api/cron/enqueue", "schedule": "0 * * * *" }] }
// Secured by CRON_SECRET env var

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return NextResponse.json({ error: 'REDIS_URL not configured' }, { status: 500 })
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
