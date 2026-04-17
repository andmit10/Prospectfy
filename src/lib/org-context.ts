import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Resolve the caller's active organization for Next.js API route handlers
 * (which don't pass through the tRPC orgProcedure middleware).
 *
 * Mirrors the logic in `src/lib/trpc.ts` orgProcedure:
 *   1. profiles.current_organization_id
 *   2. fallback: oldest org_members row
 *   3. auto-heal: if the user still has no membership, create a personal
 *      org for them (mirrors `handle_new_user` for accounts that predate
 *      the multi-tenant migration)
 *
 * Returns null only when the caller isn't authenticated.
 */
export async function resolveCurrentOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('current_organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.current_organization_id) {
    return profile.current_organization_id as string
  }

  const { data: firstMembership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let orgId = (firstMembership?.org_id as string | undefined) ?? null

  // Auto-heal: caller is authenticated but has no membership anywhere. This
  // happens for accounts created before the multi-tenant migration. We
  // create a personal org + org_admin membership on the fly using the
  // service role so RLS never blocks the bootstrap.
  if (!orgId) {
    orgId = await bootstrapPersonalOrg(userId)
  }

  if (orgId) {
    await supabase
      .from('profiles')
      .update({
        current_organization_id: orgId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
  }
  return orgId
}

/**
 * Create a personal org for a user that has none. Uses the service client
 * unconditionally so we don't rely on the caller having write permission.
 */
export async function bootstrapPersonalOrg(userId: string): Promise<string | null> {
  const service = createServiceClient()

  // Resolve a reasonable slug + name from the auth user.
  const { data: authUser } = await service.auth.admin.getUserById(userId)
  const email = authUser?.user?.email ?? ''
  const fullName =
    (authUser?.user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? ''

  const base =
    email.split('@')[0]?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() ||
    userId.slice(0, 8)
  let slug = base || `user-${Date.now().toString(36)}`

  // Retry on slug collision up to a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 5)}`

    const { data: org, error } = await service
      .from('organizations')
      .insert({
        slug: candidate,
        name: fullName || email || 'Workspace pessoal',
        plan: 'trial',
        billing_email: email || null,
      })
      .select('id')
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') continue
      console.error('[org-context] bootstrapPersonalOrg insert error:', error)
      return null
    }

    // Attach the user as org_admin.
    await service.from('org_members').insert({
      org_id: org.id,
      user_id: userId,
      role: 'org_admin',
      joined_at: new Date().toISOString(),
    })

    // Best-effort: seed default pipeline rules + agents. We swallow errors
    // via try/catch because these functions may not exist yet in older
    // databases that haven't applied every migration.
    try {
      await service.rpc('seed_default_pipeline_rules', { p_org_id: org.id })
    } catch {
      // ignore — org still usable without default rules
    }
    try {
      await service.rpc('seed_default_agents', { p_org_id: org.id })
    } catch {
      // ignore — user can still clone templates manually
    }

    return org.id as string
  }
  return null
}
