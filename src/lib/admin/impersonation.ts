import { createServiceClient } from '@/lib/supabase/service'

/**
 * Impersonation — super-admin acts as a user inside a target org to
 * support customers. Every session is first-class audited: reason is
 * required, start/end times are persisted, and the `profiles.current_organization_id`
 * flip is scoped to the session.
 *
 * Flow:
 *   1. begin(targetOrgId, reason) — snapshot caller's current org, open
 *      session row, flip current_organization_id.
 *   2. Caller uses the app normally — RLS sees the target org_id via the
 *      standard `public.user_orgs()` function. NOTE: a super_admin gets
 *      effective membership because org_members.role='super_admin' counts
 *      as a membership row.
 *   3. end(sessionId) — close the session, restore the original org.
 *
 * Security safeguards:
 *   - `reason` is required and persisted.
 *   - Only one session open at a time per admin (enforced by the partial
 *     unique index `idx_impersonation_active`).
 *   - End-of-session restores current_organization_id to the snapshot.
 *   - Stale sessions (> 4h open) auto-close via the cron (Phase 6.1).
 */

type BeginArgs = {
  superAdminUserId: string
  targetOrgId: string
  reason: string
  ip?: string | null
  userAgent?: string | null
}

export async function beginImpersonation(args: BeginArgs): Promise<{ sessionId: string }> {
  if (!args.reason.trim() || args.reason.length < 10) {
    throw new Error('reason obrigatório com ao menos 10 caracteres')
  }
  const supabase = createServiceClient()

  // Close any dangling session first — admin forgot to click "Sair" last time.
  await supabase
    .from('admin_impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('super_admin_id', args.superAdminUserId)
    .is('ended_at', null)

  // Snapshot the current org so we can restore it on end().
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_organization_id')
    .eq('id', args.superAdminUserId)
    .maybeSingle()

  // Ensure the admin has membership in the target org (required for RLS to
  // resolve it). Super-admins get auto-membership as 'super_admin' if not
  // already present.
  const { data: existingMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', args.targetOrgId)
    .eq('user_id', args.superAdminUserId)
    .maybeSingle()

  if (!existingMember) {
    await supabase.from('org_members').insert({
      org_id: args.targetOrgId,
      user_id: args.superAdminUserId,
      role: 'super_admin',
      joined_at: new Date().toISOString(),
    })
  }

  const { data: session, error: sessionErr } = await supabase
    .from('admin_impersonation_sessions')
    .insert({
      super_admin_id: args.superAdminUserId,
      target_org_id: args.targetOrgId,
      reason: args.reason,
      restore_org_id: profile?.current_organization_id ?? null,
      ip: args.ip ?? null,
      user_agent: args.userAgent ?? null,
    })
    .select('id')
    .single()

  if (sessionErr || !session) {
    throw new Error(`Falha ao abrir sessão: ${sessionErr?.message ?? 'unknown'}`)
  }

  await supabase
    .from('profiles')
    .update({
      current_organization_id: args.targetOrgId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.superAdminUserId)

  return { sessionId: session.id as string }
}

export async function endImpersonation(args: {
  superAdminUserId: string
  sessionId?: string
}): Promise<{ restoredOrgId: string | null }> {
  const supabase = createServiceClient()

  // Find the active session — either by explicit id or by "last open".
  let query = supabase
    .from('admin_impersonation_sessions')
    .select('id, restore_org_id')
    .eq('super_admin_id', args.superAdminUserId)
    .is('ended_at', null)
  if (args.sessionId) query = query.eq('id', args.sessionId)
  const { data: session } = await query.maybeSingle()

  if (!session) {
    return { restoredOrgId: null }
  }

  await supabase
    .from('admin_impersonation_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', session.id as string)

  const restoreOrg = (session.restore_org_id as string | null) ?? null
  if (restoreOrg) {
    await supabase
      .from('profiles')
      .update({
        current_organization_id: restoreOrg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.superAdminUserId)
  }

  return { restoredOrgId: restoreOrg }
}

export async function getActiveSession(superAdminUserId: string): Promise<{
  id: string
  targetOrgId: string
  startedAt: string
  reason: string
} | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('admin_impersonation_sessions')
    .select('id, target_org_id, started_at, reason')
    .eq('super_admin_id', superAdminUserId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id as string,
    targetOrgId: data.target_org_id as string,
    startedAt: data.started_at as string,
    reason: data.reason as string,
  }
}
