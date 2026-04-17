import type { SupabaseClient } from '@supabase/supabase-js'

export const TRIAL_LEAD_LIMIT = 50
export const TRIAL_DURATION_DAYS = 7

export type TrialStatus = {
  plan: string
  trialEndsAt: string | null
  leadsGenerated: number
  leadsLimit: number
  daysLeft: number // rounded down, 0 once expired
  expired: boolean // true when trial ended
  exhausted: boolean // true when leads_generated_count >= limit
  // Block new AI-generation + outbound agent sends. Paid plans never block.
  blocked: boolean
}

/**
 * Pure computation — given the persisted org state, decide whether trial
 * limits currently apply. Callers resolve the row first (server or client);
 * this function has no I/O so it's trivially testable.
 */
export function computeTrialStatus(input: {
  plan: string
  trialEndsAt: string | null
  leadsGenerated: number
  now?: Date
}): TrialStatus {
  const { plan, trialEndsAt, leadsGenerated } = input
  const now = input.now ?? new Date()

  // Paid plans never block.
  if (plan !== 'trial') {
    return {
      plan,
      trialEndsAt,
      leadsGenerated,
      leadsLimit: TRIAL_LEAD_LIMIT,
      daysLeft: Number.POSITIVE_INFINITY,
      expired: false,
      exhausted: false,
      blocked: false,
    }
  }

  const endsAtMs = trialEndsAt ? new Date(trialEndsAt).getTime() : null
  const nowMs = now.getTime()
  const expired = endsAtMs !== null && endsAtMs <= nowMs
  const exhausted = leadsGenerated >= TRIAL_LEAD_LIMIT

  const daysLeft = expired || endsAtMs === null
    ? 0
    : Math.max(0, Math.floor((endsAtMs - nowMs) / (1000 * 60 * 60 * 24)))

  return {
    plan,
    trialEndsAt,
    leadsGenerated,
    leadsLimit: TRIAL_LEAD_LIMIT,
    daysLeft,
    expired,
    exhausted,
    blocked: expired || exhausted,
  }
}

/**
 * Fetch the org's trial columns and compute status. Uses the caller-supplied
 * supabase client so RLS-scoped and service-role calls both work.
 */
export async function getTrialStatus(
  supabase: SupabaseClient,
  orgId: string
): Promise<TrialStatus> {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan, trial_ends_at, leads_generated_count')
    .eq('id', orgId)
    .single()

  if (error || !data) {
    // Conservative: missing org → treat as expired trial so writes fail closed.
    return computeTrialStatus({
      plan: 'trial',
      trialEndsAt: null,
      leadsGenerated: TRIAL_LEAD_LIMIT,
    })
  }

  return computeTrialStatus({
    plan: data.plan as string,
    trialEndsAt: (data.trial_ends_at as string | null) ?? null,
    leadsGenerated: (data.leads_generated_count as number) ?? 0,
  })
}

/**
 * Atomically increment the generated-lead counter. Returns the new count.
 * Falls back to a best-effort update if the SQL helper is missing.
 */
export async function incrementLeadsGenerated(
  supabase: SupabaseClient,
  orgId: string,
  delta: number
): Promise<number> {
  if (delta <= 0) return 0
  const { data, error } = await supabase.rpc('increment_leads_generated', {
    p_org_id: orgId,
    p_delta: delta,
  })
  if (!error && typeof data === 'number') return data

  // Fallback path (migration not applied yet): read-modify-write.
  const { data: row } = await supabase
    .from('organizations')
    .select('leads_generated_count')
    .eq('id', orgId)
    .single()
  const prev = (row?.leads_generated_count as number) ?? 0
  const next = prev + delta
  await supabase
    .from('organizations')
    .update({ leads_generated_count: next, updated_at: new Date().toISOString() })
    .eq('id', orgId)
  return next
}
