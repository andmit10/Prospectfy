import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  protectedProcedure,
  orgProcedure,
  adminProcedure,
} from '@/lib/trpc'

/**
 * Organizations router — core of the multi-tenant model.
 *
 * Shape-wise, users belong to N organizations via org_members. The currently
 * active org is stored in profiles.current_organization_id and resolved by
 * orgProcedure for every other router.
 */

const ROLE_VALUES = ['org_admin', 'member', 'viewer'] as const
type Role = (typeof ROLE_VALUES)[number]

export const organizationsRouter = router({
  /**
   * List every organization the caller is a member of, with their role and
   * whether it's the active one. Used for the sidebar org switcher.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    type MembershipRow = {
      role: string
      joined_at: string
      organizations:
        | {
            id: string
            slug: string
            name: string
            plan: string
            suspended_at: string | null
          }
        | Array<{
            id: string
            slug: string
            name: string
            plan: string
            suspended_at: string | null
          }>
        | null
    }

    const [{ data: memberships, error: membershipsError }, { data: profile }] =
      await Promise.all([
        ctx.supabase
          .from('org_members')
          .select('role, joined_at, organizations(id, slug, name, plan, suspended_at)')
          .eq('user_id', ctx.user.id)
          .order('joined_at', { ascending: true }),
        ctx.supabase
          .from('profiles')
          .select('current_organization_id')
          .eq('id', ctx.user.id)
          .maybeSingle(),
      ])

    if (membershipsError) throw membershipsError

    const currentId = profile?.current_organization_id ?? null

    return ((memberships ?? []) as unknown as MembershipRow[])
      .map((m) => {
        const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
        if (!org) return null
        return {
          id: org.id,
          slug: org.slug,
          name: org.name,
          plan: org.plan,
          suspended: !!org.suspended_at,
          role: m.role as Role | 'super_admin',
          isCurrent: org.id === currentId,
        }
      })
      .filter((o): o is NonNullable<typeof o> => o !== null)
  }),

  /** Details about the currently active org (settings page, billing). */
  current: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('organizations')
      .select('*')
      .eq('id', ctx.orgId)
      .single()

    if (error) throw error
    return { ...data, currentUserRole: ctx.orgRole }
  }),

  /** Create a new organization. Caller becomes its org_admin. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        slug: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
            message: 'Slug deve conter apenas letras minúsculas, números e hífens',
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Derive slug if not provided.
      let slug = input.slug
      if (!slug) {
        const base = input.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40)
        slug = base || `org-${Date.now().toString(36)}`
      }

      // Try insert; if slug collides, retry with a short suffix.
      for (let attempt = 0; attempt < 3; attempt++) {
        const candidate = attempt === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`

        const { data: org, error: orgError } = await ctx.supabase
          .from('organizations')
          .insert({ slug: candidate, name: input.name, plan: 'trial' })
          .select('*')
          .single()

        if (orgError) {
          // unique_violation on slug → retry
          if ((orgError as { code?: string }).code === '23505') continue
          throw orgError
        }

        const { error: memberError } = await ctx.supabase
          .from('org_members')
          .insert({ org_id: org.id, user_id: ctx.user.id, role: 'org_admin' })

        if (memberError) throw memberError

        // Auto-switch to the new org.
        await ctx.supabase
          .from('profiles')
          .update({ current_organization_id: org.id, updated_at: new Date().toISOString() })
          .eq('id', ctx.user.id)

        return org
      }

      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Não foi possível criar organização com esse slug. Tente outro.',
      })
    }),

  /** Switch the caller's active organization (persists in profiles). */
  switch: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the user is actually a member.
      const { data: membership, error } = await ctx.supabase
        .from('org_members')
        .select('role')
        .eq('org_id', input.orgId)
        .eq('user_id', ctx.user.id)
        .maybeSingle()

      if (error) throw error
      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Você não é membro desta organização.',
        })
      }

      const { error: updateError } = await ctx.supabase
        .from('profiles')
        .update({
          current_organization_id: input.orgId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ctx.user.id)

      if (updateError) throw updateError
      return { orgId: input.orgId, role: membership.role }
    }),

  /** Update the active org's name/billing email. org_admin only. */
  update: adminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80).optional(),
        billing_email: z.string().email().optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (input.name !== undefined) patch.name = input.name
      if (input.billing_email !== undefined) patch.billing_email = input.billing_email
      if (input.settings !== undefined) patch.settings = input.settings

      const { data, error } = await ctx.supabase
        .from('organizations')
        .update(patch)
        .eq('id', ctx.orgId)
        .select('*')
        .single()

      if (error) throw error
      return data
    }),

  /** List members of the active org. Any member can see the list. */
  listMembers: orgProcedure.query(async ({ ctx }) => {
    type MemberRow = {
      role: string
      joined_at: string
      invited_at: string | null
      profiles:
        | { id: string; full_name: string | null; avatar_url: string | null }
        | Array<{ id: string; full_name: string | null; avatar_url: string | null }>
        | null
    }

    const { data, error } = await ctx.supabase
      .from('org_members')
      .select('role, joined_at, invited_at, profiles:user_id(id, full_name, avatar_url)')
      .eq('org_id', ctx.orgId)
      .order('joined_at', { ascending: true })

    if (error) throw error
    return ((data ?? []) as unknown as MemberRow[]).map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return {
        userId: p?.id ?? '',
        fullName: p?.full_name ?? '',
        avatarUrl: p?.avatar_url ?? null,
        role: m.role as Role | 'super_admin',
        joinedAt: m.joined_at,
        invitedAt: m.invited_at,
      }
    })
  }),

  /**
   * Invite an existing auth user to the org by their email. v1 only supports
   * invite-by-email-of-already-signed-up users; full magic-link invites come
   * later. Non-existent emails return an explicit error with next-step hint.
   */
  inviteMember: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(ROLE_VALUES).default('member'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Look up the target user by email. Requires service-role for auth.users —
      // fallback to a profiles join when the email lives in user_metadata.
      // For Phase 0 keep it simple: use Supabase admin API via service key.
      const { data: target, error: lookupError } = await ctx.supabase
        .rpc('lookup_user_id_by_email', { p_email: input.email })
        .maybeSingle()

      if (lookupError) throw lookupError
      if (!target || !(target as { user_id: string | null }).user_id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message:
            'Nenhum usuário com esse e-mail. Peça para ele criar conta antes — convites por magic link chegam em breve.',
        })
      }

      const targetUserId = (target as { user_id: string }).user_id

      // Don't double-insert if they're already a member.
      const { data: existing } = await ctx.supabase
        .from('org_members')
        .select('role')
        .eq('org_id', ctx.orgId)
        .eq('user_id', targetUserId)
        .maybeSingle()

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Este usuário já é membro da organização.',
        })
      }

      const { error: insertError } = await ctx.supabase
        .from('org_members')
        .insert({
          org_id: ctx.orgId,
          user_id: targetUserId,
          role: input.role,
          invited_by: ctx.user.id,
          invited_at: new Date().toISOString(),
        })

      if (insertError) throw insertError

      await ctx.supabase.from('audit_log').insert({
        org_id: ctx.orgId,
        actor_user_id: ctx.user.id,
        action: 'invite_member',
        target_type: 'user',
        target_id: targetUserId,
        metadata: { role: input.role, email: input.email },
      })

      return { invited: true }
    }),

  /** Change a member's role. org_admin only. Cannot demote the last admin. */
  updateMemberRole: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(ROLE_VALUES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && input.role !== 'org_admin') {
        // Protect the org from being left admin-less.
        const { count } = await ctx.supabase
          .from('org_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId)
          .eq('role', 'org_admin')

        if ((count ?? 0) <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Você é o único admin — promova outro membro antes de sair.',
          })
        }
      }

      const { error } = await ctx.supabase
        .from('org_members')
        .update({ role: input.role })
        .eq('org_id', ctx.orgId)
        .eq('user_id', input.userId)

      if (error) throw error

      await ctx.supabase.from('audit_log').insert({
        org_id: ctx.orgId,
        actor_user_id: ctx.user.id,
        action: 'update_member_role',
        target_type: 'user',
        target_id: input.userId,
        metadata: { new_role: input.role },
      })

      return { updated: true }
    }),

  /** Remove a member from the org. org_admin only. Cannot remove last admin. */
  removeMember: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        const { count } = await ctx.supabase
          .from('org_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('org_id', ctx.orgId)
          .eq('role', 'org_admin')

        if ((count ?? 0) <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Você é o único admin — promova outro membro antes de sair.',
          })
        }
      }

      const { error } = await ctx.supabase
        .from('org_members')
        .delete()
        .eq('org_id', ctx.orgId)
        .eq('user_id', input.userId)

      if (error) throw error

      await ctx.supabase.from('audit_log').insert({
        org_id: ctx.orgId,
        actor_user_id: ctx.user.id,
        action: 'remove_member',
        target_type: 'user',
        target_id: input.userId,
      })

      return { removed: true }
    }),

  /** Leave the active org. Same safeguard as removeMember self-delete. */
  leave: orgProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.supabase
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId)
      .eq('role', 'org_admin')

    if (ctx.orgRole === 'org_admin' && (count ?? 0) <= 1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Você é o único admin — promova outro membro antes de sair.',
      })
    }

    const { error } = await ctx.supabase
      .from('org_members')
      .delete()
      .eq('org_id', ctx.orgId)
      .eq('user_id', ctx.user.id)

    if (error) throw error

    // Clear current_organization_id so the next request re-picks another org.
    await ctx.supabase
      .from('profiles')
      .update({ current_organization_id: null, updated_at: new Date().toISOString() })
      .eq('id', ctx.user.id)

    return { left: true }
  }),
})
