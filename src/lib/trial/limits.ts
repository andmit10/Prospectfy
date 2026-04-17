import type { SupabaseClient } from '@supabase/supabase-js'

/** Default cap when neither the org nor the plan defines one. */
export const TRIAL_LEAD_LIMIT = 50
export const TRIAL_DURATION_DAYS = 7

export type TrialStatus = {
  plan: string
  trialEndsAt: string | null
  leadsGenerated: number
  leadsLimit: number
  /** Where the limit came from — useful for the admin UI tooltip. */
  leadsLimitSource: 'org_override' | 'plan' | 'default'
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
 *
 * `leadsLimit` resolution (passed in by `getTrialStatus`):
 *   1. org.leads_generated_limit (per-org admin override)
 *   2. plan_catalog.max_leads_month (plan default)
 *   3. TRIAL_LEAD_LIMIT (hard fallback)
 */
export function computeTrialStatus(input: {
  plan: string
  trialEndsAt: string | null
  leadsGenerated: number
  /** Resolved cap. Defaults to TRIAL_LEAD_LIMIT when omitted (legacy callers). */
  leadsLimit?: number
  leadsLimitSource?: TrialStatus['leadsLimitSource']
  now?: Date
}): TrialStatus {
  const { plan, trialEndsAt, leadsGenerated } = input
  const leadsLimit = input.leadsLimit ?? TRIAL_LEAD_LIMIT
  const leadsLimitSource = input.leadsLimitSource ?? 'default'
  const now = input.now ?? new Date()

  // Paid plans never block.
  if (plan !== 'trial') {
    return {
      plan,
      trialEndsAt,
      leadsGenerated,
      leadsLimit,
      leadsLimitSource,
      daysLeft: Number.POSITIVE_INFINITY,
      expired: false,
      exhausted: false,
      blocked: false,
    }
  }

  const endsAtMs = trialEndsAt ? new Date(trialEndsAt).getTime() : null
  const nowMs = now.getTime()
  const expired = endsAtMs !== null && endsAtMs <= nowMs
  const exhausted = leadsGenerated >= leadsLimit

  const daysLeft = expired || endsAtMs === null
    ? 0
    : Math.max(0, Math.floor((endsAtMs - nowMs) / (1000 * 60 * 60 * 24)))

  return {
    plan,
    trialEndsAt,
    leadsGenerated,
    leadsLimit,
    leadsLimitSource,
    daysLeft,
    expired,
    exhausted,
    blocked: expired || exhausted,
  }
}

/**
 * Fetch the org's trial state + the resolved lead cap. The cap follows:
 *   org.leads_generated_limit → plan_catalog.max_leads_month → TRIAL_LEAD_LIMIT
 *
 * Uses the caller-supplied supabase client so RLS-scoped (page) and
 * service-role (api/agent) calls both work.
 */
export async function getTrialStatus(
  supabase: SupabaseClient,
  orgId: string
): Promise<TrialStatus> {
  const { data, error } = await supabase
    .from('organizations')
    .select('plan, trial_ends_at, leads_generated_count, leads_generated_limit')
    .eq('id', orgId)
    .single()

  if (error || !data) {
    // Conservative: missing org → treat as expired trial so writes fail closed.
    return computeTrialStatus({
      plan: 'trial',
      trialEndsAt: null,
      leadsGenerated: TRIAL_LEAD_LIMIT,
      leadsLimit: TRIAL_LEAD_LIMIT,
      leadsLimitSource: 'default',
    })
  }

  const orgOverride = (data.leads_generated_limit as number | null) ?? null

  // Plan default — only fetched when the org has no override (saves a query).
  let planLimit: number | null = null
  if (orgOverride === null) {
    const { data: planRow } = await supabase
      .from('plan_catalog')
      .select('max_leads_month')
      .eq('plan', data.plan as string)
      .maybeSingle()
    planLimit = (planRow?.max_leads_month as number | null) ?? null
  }

  const resolvedLimit = orgOverride ?? planLimit ?? TRIAL_LEAD_LIMIT
  const source: TrialStatus['leadsLimitSource'] =
    orgOverride !== null ? 'org_override' : planLimit !== null ? 'plan' : 'default'

  return computeTrialStatus({
    plan: data.plan as string,
    trialEndsAt: (data.trial_ends_at as string | null) ?? null,
    leadsGenerated: (data.leads_generated_count as number) ?? 0,
    leadsLimit: resolvedLimit,
    leadsLimitSource: source,
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
