import type { SupabaseClient } from '@supabase/supabase-js'

export interface QueueJob {
  id: string
  lead_id: string
  campaign_id: string
  step_id: string
  scheduled_at: string
  attempts: number
}

export interface EnqueueParams {
  lead_id: string
  campaign_id: string
  step_id: string
  scheduled_at: Date
}

// Fetch all pending jobs whose scheduled_at has passed
export async function fetchPendingJobs(supabase: SupabaseClient): Promise<QueueJob[]> {
  const { data, error } = await supabase
    .from('agent_queue')
    .select('id, lead_id, campaign_id, step_id, scheduled_at, attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', 3) // max 3 retries
    .order('scheduled_at', { ascending: true })
    .limit(100)

  if (error) throw error
  return data ?? []
}

// Mark a job as processing (optimistic lock via status update)
export async function claimJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<boolean> {
  // Atomically flip status to 'processing' only if currently 'pending'
  const { data } = await supabase
    .from('agent_queue')
    .update({ status: 'processing' })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id')

  return Array.isArray(data) && data.length > 0
}

export async function markJobComplete(
  supabase: SupabaseClient,
  jobId: string
) {
  await supabase
    .from('agent_queue')
    .update({ status: 'completed', processed_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  error: string,
  attempts: number
) {
  const nextStatus = attempts >= 3 ? 'failed' : 'pending'
  const retryAt = attempts >= 3 ? null : new Date(Date.now() + 15 * 60 * 1000) // retry in 15min

  await supabase
    .from('agent_queue')
    .update({
      status: nextStatus,
      last_error: error,
      attempts,
      ...(retryAt ? { scheduled_at: retryAt.toISOString() } : {}),
    })
    .eq('id', jobId)
}

// Enqueue next step for a lead after current one completes
export async function enqueueNextStep(
  supabase: SupabaseClient,
  params: EnqueueParams
) {
  // Avoid duplicates
  const { count } = await supabase
    .from('agent_queue')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', params.lead_id)
    .eq('step_id', params.step_id)
    .in('status', ['pending', 'processing', 'completed'])

  if ((count ?? 0) > 0) return // already queued

  await supabase.from('agent_queue').insert({
    lead_id: params.lead_id,
    campaign_id: params.campaign_id,
    step_id: params.step_id,
    scheduled_at: params.scheduled_at.toISOString(),
    status: 'pending',
  })
}
