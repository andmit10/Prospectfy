import { Worker, type Job } from 'bullmq'
import { createServiceClient } from '@/lib/supabase/service'
import { runProspectingAgent } from '@/agents/prospecting-agent'
import { markJobComplete, markJobFailed, enqueueNextStep } from '@/server/services/agent-queue'
import type { Lead, CadenciaStep, Interaction } from '@/types'

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
}

export interface AgentJobData {
  queue_job_id: string
  lead_id: string
  campaign_id: string
  step_id: string
  attempts: number
}

async function processAgentJob(job: Job<AgentJobData>) {
  const { queue_job_id, lead_id, campaign_id, step_id, attempts } = job.data
  const supabase = createServiceClient()

  // Fetch all data needed for the agent
  const [leadRes, stepRes, interactionsRes, profileRes] = await Promise.all([
    supabase.from('leads').select('*').eq('id', lead_id).single(),
    supabase.from('cadencia_steps').select('*').eq('id', step_id).single(),
    supabase
      .from('interactions')
      .select('*')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', campaign_id)
      .single(),
  ])

  if (leadRes.error || !leadRes.data) throw new Error('Lead not found')
  if (stepRes.error || !stepRes.data) throw new Error('Step not found')
  if (!profileRes.data) throw new Error('Campaign/user not found')

  const lead = leadRes.data as Lead
  const step = stepRes.data as CadenciaStep
  const interactions = (interactionsRes.data ?? []) as Interaction[]

  // Skip if lead is in a terminal state
  if (['convertido', 'perdido'].includes(lead.status_pipeline)) {
    await markJobComplete(supabase, queue_job_id)
    return
  }

  // Get user profile for API keys
  const { data: profile } = await supabase
    .from('profiles')
    .select('directfy_api_key, calendly_url, company_name')
    .eq('id', profileRes.data.user_id)
    .single()

  if (!profile?.directfy_api_key) {
    await markJobFailed(supabase, queue_job_id, 'Directfy API key not configured', attempts + 1)
    return
  }

  // Count total steps for context
  const { count: totalSteps } = await supabase
    .from('cadencia_steps')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign_id)
    .eq('ativo', true)

  // Run the agent
  const result = await runProspectingAgent({
    lead,
    step,
    recentInteractions: interactions,
    totalSteps: totalSteps ?? 1,
    directfyApiKey: profile.directfy_api_key,
    calendlyUrl: profile.calendly_url ?? '',
    companyName: profile.company_name ?? 'nossa empresa',
    supabase,
  })

  // Store agent reasoning in an interaction log
  if (result.reasoning) {
    await supabase.from('interactions').insert({
      lead_id,
      campaign_id,
      step_id,
      canal: 'whatsapp',
      tipo: result.success ? 'enviado' : 'erro',
      agent_reasoning: result.reasoning,
      metadata: { tools_executed: result.toolsExecuted },
    }).then(() => {}) // fire-and-forget, don't fail on log error
  }

  if (!result.success) {
    await markJobFailed(supabase, queue_job_id, result.error ?? 'Agent failed', attempts + 1)
    return
  }

  await markJobComplete(supabase, queue_job_id)

  // Enqueue the next step for this lead if one exists
  const { data: nextStep } = await supabase
    .from('cadencia_steps')
    .select('id, delay_hours')
    .eq('campaign_id', campaign_id)
    .eq('step_order', step.step_order + 1)
    .eq('ativo', true)
    .single()

  if (nextStep) {
    const scheduledAt = new Date(
      Date.now() + nextStep.delay_hours * 60 * 60 * 1000
    )
    await enqueueNextStep(supabase, {
      lead_id,
      campaign_id,
      step_id: nextStep.id,
      scheduled_at: scheduledAt,
    })
  }
}

const worker = new Worker<AgentJobData>('agent-jobs', processAgentJob, {
  connection: REDIS_CONNECTION,
  concurrency: 5,
})

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed for lead ${job.data.lead_id}`)
})

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message)
})

console.log('[worker] BullMQ prospecting worker started')
