import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { router, superAdminProcedure } from '@/lib/trpc'
import { createServiceClient } from '@/lib/supabase/service'
import { serverEnv } from '@/lib/env.server'
import {
  beginImpersonation,
  endImpersonation,
  getActiveSession,
} from '@/lib/admin/impersonation'

/**
 * Super-admin tRPC router. Every procedure runs on `superAdminProcedure`,
 * which verifies the caller has `org_members.role = 'super_admin'` anywhere.
 * Inside handlers we use the service client (bypasses RLS) so admin queries
 * can span organizations without fighting the policy engine.
 */

export const adminRouter = router({
  // ─── Overview ─────────────────────────────────────────────────────────
  overview: superAdminProcedure.query(async () => {
    const supabase = createServiceClient()

    const [orgsRes, mrrRes, churnRes, runsRes] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, plan, suspended_at, trial_ends_at, created_at'),
      supabase
        .from('admin_mrr_daily')
        .select('date, total_mrr, plan_mrr, addon_mrr')
        .order('date', { ascending: false })
        .limit(30),
      supabase.from('admin_churn_30d').select('*').maybeSingle(),
      supabase
        .from('agent_runs')
        .select('id', { head: true, count: 'exact' })
        .gte('started_at', new Date(Date.now() - 86400_000).toISOString()),
    ])

    const orgs = orgsRes.data ?? []
    const mrr = mrrRes.data ?? []
    const latestMrr = mrr[0]
    const previousMrr = mrr[29] ?? null

    return {
      totals: {
        orgs: orgs.length,
        active: orgs.filter((o) => !o.suspended_at).length,
        suspended: orgs.filter((o) => !!o.suspended_at).length,
        inTrial: orgs.filter(
          (o) => o.plan === 'trial' && (!o.trial_ends_at || new Date(o.trial_ends_at as string) > new Date())
        ).length,
        runsLast24h: runsRes.count ?? 0,
      },
      mrr: {
        current: Number(latestMrr?.total_mrr ?? 0),
        plan: Number(latestMrr?.plan_mrr ?? 0),
        addons: Number(latestMrr?.addon_mrr ?? 0),
        thirtyDayGrowth:
          previousMrr && Number(previousMrr.total_mrr) > 0
            ? ((Number(latestMrr?.total_mrr ?? 0) - Number(previousMrr.total_mrr)) /
                Number(previousMrr.total_mrr)) *
              100
            : 0,
        series: mrr.reverse().map((row) => ({
          date: row.date as string,
          total: Number(row.total_mrr),
        })),
      },
      churn: {
        suspendedLast30: Number(churnRes.data?.suspended_30d ?? 0),
        active: Number(churnRes.data?.active ?? 0),
        inTrial: Number(churnRes.data?.in_trial ?? 0),
        paying: Number(churnRes.data?.paying ?? 0),
      },
    }
  }),

  // ─── Organizations ────────────────────────────────────────────────────
  listOrgs: superAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        plan: z.string().optional(),
        suspended: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ input }) => {
      const supabase = createServiceClient()
      let query = supabase
        .from('organizations')
        .select(
          'id, slug, name, plan, suspended_at, suspended_reason, stripe_customer_id, stripe_subscription_id, trial_ends_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (input.search)
        query = query.or(`name.ilike.%${input.search}%,slug.ilike.%${input.search}%`)
      if (input.plan) query = query.eq('plan', input.plan)
      if (input.suspended !== undefined) {
        query = input.suspended
          ? query.not('suspended_at', 'is', null)
          : query.is('suspended_at', null)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    }),

  getOrg: superAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = createServiceClient()
      const orgId = input.id
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()

      const [
        orgRes,
        planRes,
        memberRowsRes,
        addonsRes,
        auditRes,
        creditsRes,
        leadsCountRes,
        agentsCountRes,
        runs30Res,
        tokens30Res,
        messages30Res,
        kbCountRes,
      ] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId).single(),
        supabase
          .from('plan_catalog')
          .select('*'),
        supabase
          .from('org_members')
          .select('role, joined_at, invited_at, user_id, profiles:user_id(id, full_name, avatar_url)')
          .eq('org_id', orgId),
        supabase
          .from('plan_addons')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
        supabase
          .from('audit_log')
          .select('id, action, target_type, created_at, actor_user_id, metadata')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('credit_adjustments')
          .select('id, delta_credits, reason, created_at, actor_user_id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('leads')
          .select('id', { head: true, count: 'exact' })
          .eq('organization_id', orgId)
          .is('deleted_at', null),
        supabase
          .from('agents')
          .select('id', { head: true, count: 'exact' })
          .eq('organization_id', orgId),
        supabase
          .from('agent_runs')
          .select('id, tokens_used, cost_usd, status, started_at')
          .eq('organization_id', orgId)
          .gte('started_at', thirtyDaysAgo),
        supabase
          .from('llm_telemetry')
          .select('tokens_in, tokens_out, cost_usd')
          .eq('org_id', orgId)
          .gte('created_at', thirtyDaysAgo),
        supabase
          .from('channel_messages')
          .select('id, status', { head: false, count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', thirtyDaysAgo),
        supabase
          .from('knowledge_bases')
          .select('id', { head: true, count: 'exact' })
          .eq('organization_id', orgId),
      ])

      if (orgRes.error) throw orgRes.error

      // Fetch auth.users emails for each member via admin API.
      const memberRows = (memberRowsRes.data ?? []) as Array<{
        role: string
        joined_at: string
        invited_at: string | null
        user_id: string
        profiles: { id: string; full_name: string | null; avatar_url: string | null } | Array<{ id: string; full_name: string | null; avatar_url: string | null }> | null
      }>

      const membersWithEmail = await Promise.all(
        memberRows.map(async (m) => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          const { data: authUser } = await supabase.auth.admin.getUserById(m.user_id)
          return {
            userId: m.user_id,
            role: m.role,
            joinedAt: m.joined_at,
            invitedAt: m.invited_at,
            fullName: profile?.full_name ?? null,
            avatarUrl: profile?.avatar_url ?? null,
            email: authUser?.user?.email ?? null,
            lastSignInAt: authUser?.user?.last_sign_in_at ?? null,
          }
        })
      )

      // Usage stats aggregation
      const runs = runs30Res.data ?? []
      const tokensRows = tokens30Res.data ?? []
      const totalTokens30 = tokensRows.reduce(
        (acc, r) => acc + Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0),
        0
      )
      const totalCost30 = tokensRows.reduce(
        (acc, r) => acc + Number(r.cost_usd ?? 0),
        0
      )

      // Revenue: plan price + sum of active addons.
      const org = orgRes.data as Record<string, unknown>
      const planCatalog = (planRes.data ?? []) as Array<{
        plan: string
        name: string
        monthly_price_brl: number
      }>
      const orgPlan = planCatalog.find((p) => p.plan === org.plan)
      const planPrice = Number(orgPlan?.monthly_price_brl ?? 0)
      const activeAddons = (addonsRes.data ?? []).filter(
        (a) => (a as { active: boolean }).active
      )
      const addonPrice = activeAddons.reduce(
        (acc, a) =>
          acc +
          Number((a as { monthly_price_brl: number }).monthly_price_brl) *
            Number((a as { quantity: number }).quantity),
        0
      )
      const mrr = planPrice + addonPrice

      // Ticket médio: MRR per active member (rough proxy).
      const activeMemberCount = memberRows.length
      const ticketMedio = activeMemberCount > 0 ? mrr / activeMemberCount : 0

      return {
        org,
        plan: orgPlan ?? null,
        members: membersWithEmail,
        addons: addonsRes.data ?? [],
        audit: auditRes.data ?? [],
        credits: creditsRes.data ?? [],
        stats: {
          leads: leadsCountRes.count ?? 0,
          agents: agentsCountRes.count ?? 0,
          runsLast30: runs.length,
          runsSuccess: runs.filter((r) => r.status === 'success').length,
          runsFailed: runs.filter((r) => r.status === 'failed').length,
          tokensLast30: totalTokens30,
          costUsdLast30: totalCost30,
          messagesLast30: messages30Res.count ?? 0,
          knowledgeBases: kbCountRes.count ?? 0,
        },
        revenue: {
          mrr,
          planPrice,
          addonPrice,
          ticketMedio,
          currency: 'BRL',
        },
      }
    }),

  /** Update org metadata — name, slug, billing email, plan, trial dates. */
  updateOrg: superAdminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        slug: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
          .optional(),
        billing_email: z.string().email().optional().or(z.literal('')),
        plan: z
          .enum(['trial', 'starter', 'pro', 'business', 'agency', 'enterprise'])
          .optional(),
        trial_ends_at: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (input.name !== undefined) patch.name = input.name
      if (input.slug !== undefined) patch.slug = input.slug
      if (input.billing_email !== undefined)
        patch.billing_email = input.billing_email || null
      if (input.plan !== undefined) patch.plan = input.plan
      if (input.trial_ends_at !== undefined) patch.trial_ends_at = input.trial_ends_at

      const { error } = await supabase
        .from('organizations')
        .update(patch)
        .eq('id', input.id)

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Já existe uma organização com esse slug.',
          })
        }
        throw error
      }

      await supabase.from('audit_log').insert({
        org_id: input.id,
        actor_user_id: ctx.user.id,
        action: 'update_org_admin',
        target_type: 'organization',
        target_id: input.id,
        metadata: patch,
      })

      return { success: true }
    }),

  /** Send a password-reset email to a user. Uses Supabase Auth recovery. */
  sendPasswordReset: superAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        orgIdForAudit: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()

      // `generateLink` returns the link AND (when email is configured in Supabase
      // Auth settings) sends the recovery email automatically. We return the
      // plaintext link so the admin can also copy + share manually if needed.
      const { data, error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: input.email,
      })

      if (error) throw error

      if (input.orgIdForAudit) {
        await supabase.from('audit_log').insert({
          org_id: input.orgIdForAudit,
          actor_user_id: ctx.user.id,
          action: 'send_password_reset',
          target_type: 'user',
          target_id: null,
          metadata: { email: input.email },
        })
      }

      return {
        sent: true,
        email: input.email,
        // actionLink only populated when email provider isn't configured
        actionLink: data?.properties?.action_link ?? null,
      }
    }),

  /** Remove a member from an org (admin action). */
  removeOrgMember: superAdminProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('org_id', input.orgId)
        .eq('user_id', input.userId)
      if (error) throw error

      await supabase.from('audit_log').insert({
        org_id: input.orgId,
        actor_user_id: ctx.user.id,
        action: 'remove_org_member',
        target_type: 'user',
        target_id: input.userId,
      })

      return { success: true }
    }),

  /** Change a member's role inside an org. */
  updateMemberRole: superAdminProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(['super_admin', 'org_admin', 'member', 'viewer']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase
        .from('org_members')
        .update({ role: input.role })
        .eq('org_id', input.orgId)
        .eq('user_id', input.userId)
      if (error) throw error

      await supabase.from('audit_log').insert({
        org_id: input.orgId,
        actor_user_id: ctx.user.id,
        action: 'update_member_role_admin',
        target_type: 'user',
        target_id: input.userId,
        metadata: { new_role: input.role },
      })

      return { success: true }
    }),

  suspendOrg: superAdminProcedure
    .input(z.object({ id: z.string().uuid(), reason: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase
        .from('organizations')
        .update({
          suspended_at: new Date().toISOString(),
          suspended_reason: input.reason,
        })
        .eq('id', input.id)
      if (error) throw error

      await supabase.from('audit_log').insert({
        org_id: input.id,
        actor_user_id: ctx.user.id,
        action: 'suspend_org',
        target_type: 'organization',
        target_id: input.id,
        metadata: { reason: input.reason },
      })
      return { success: true }
    }),

  resumeOrg: superAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase
        .from('organizations')
        .update({ suspended_at: null, suspended_reason: null })
        .eq('id', input.id)
      if (error) throw error

      await supabase.from('audit_log').insert({
        org_id: input.id,
        actor_user_id: ctx.user.id,
        action: 'resume_org',
        target_type: 'organization',
        target_id: input.id,
      })
      return { success: true }
    }),

  // ─── Impersonation ────────────────────────────────────────────────────
  beginImpersonation: superAdminProcedure
    .input(
      z.object({
        targetOrgId: z.string().uuid(),
        reason: z.string().min(10).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId } = await beginImpersonation({
        superAdminUserId: ctx.user.id,
        targetOrgId: input.targetOrgId,
        reason: input.reason,
      })
      return { sessionId }
    }),

  endImpersonation: superAdminProcedure.mutation(async ({ ctx }) => {
    const result = await endImpersonation({ superAdminUserId: ctx.user.id })
    return result
  }),

  activeSession: superAdminProcedure.query(async ({ ctx }) => {
    return getActiveSession(ctx.user.id)
  }),

  // ─── Credits & coupons ────────────────────────────────────────────────
  adjustCredits: superAdminProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        delta: z.number().int(),
        reason: z.string().min(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase.from('credit_adjustments').insert({
        organization_id: input.orgId,
        actor_user_id: ctx.user.id,
        delta_credits: input.delta,
        reason: input.reason,
      })
      if (error) throw error
      return { success: true }
    }),

  /**
   * Fetch the last invoices + charges for a given org from Stripe. Used in the
   * admin org detail view so support/finance can see payment history without
   * jumping to the Stripe dashboard. Returns an empty result if Stripe isn't
   * configured or the org has no customer id — the UI handles that gracefully.
   */
  listOrgPayments: superAdminProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!serverEnv.STRIPE_SECRET_KEY) {
        return { configured: false as const, invoices: [], charges: [] }
      }
      const supabase = createServiceClient()
      const { data: org } = await supabase
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', input.orgId)
        .single()

      const customerId = (org as { stripe_customer_id: string | null } | null)?.stripe_customer_id
      if (!customerId) {
        return { configured: true as const, customerId: null, invoices: [], charges: [] }
      }

      const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
        apiVersion: '2026-03-25.dahlia',
      })

      // Pull in parallel — both are short lists, we cap at 20 each.
      const [invoicesRes, chargesRes] = await Promise.all([
        stripe.invoices.list({ customer: customerId, limit: 20 }),
        stripe.charges.list({ customer: customerId, limit: 20 }),
      ])

      return {
        configured: true as const,
        customerId,
        invoices: invoicesRes.data.map((i) => ({
          id: i.id,
          number: i.number,
          status: i.status,
          amount_paid: i.amount_paid,
          amount_due: i.amount_due,
          currency: i.currency,
          created: i.created,
          hosted_invoice_url: i.hosted_invoice_url,
          invoice_pdf: i.invoice_pdf,
          period_start: i.period_start,
          period_end: i.period_end,
        })),
        charges: chargesRes.data.map((c) => ({
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          paid: c.paid,
          refunded: c.refunded,
          created: c.created,
          receipt_url: c.receipt_url,
          failure_message: c.failure_message,
          payment_method_details: c.payment_method_details?.type ?? null,
        })),
      }
    }),

  listCoupons: superAdminProcedure.query(async () => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }),

  createCoupon: superAdminProcedure
    .input(
      z.object({
        code: z.string().min(3).max(40).regex(/^[A-Z0-9_-]+$/, { message: 'Código deve ser MAIÚSCULO alfanumérico' }),
        discountPercent: z.number().int().min(1).max(100).optional(),
        discountAmountBrl: z.number().min(1).max(10000).optional(),
        maxUses: z.number().int().positive().optional(),
        validFrom: z.string().datetime().optional(),
        expiresAt: z.string().datetime().optional(),
        appliesToPlans: z.array(z.string()).default([]),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.discountPercent == null && input.discountAmountBrl == null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Informe discountPercent OU discountAmountBrl',
        })
      }
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('coupons')
        .insert({
          code: input.code,
          discount_percent: input.discountPercent ?? null,
          discount_amount_brl: input.discountAmountBrl ?? null,
          max_uses: input.maxUses ?? null,
          valid_from: input.validFrom ?? null,
          expires_at: input.expiresAt ?? null,
          applies_to_plans: input.appliesToPlans,
          notes: input.notes ?? null,
          created_by: ctx.user.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    }),

  // ─── Feature flags ────────────────────────────────────────────────────
  listFlags: superAdminProcedure.query(async () => {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('feature_flags')
      .select('*')
      .order('key', { ascending: true })
    if (error) throw error
    return data ?? []
  }),

  updateFlag: superAdminProcedure
    .input(
      z.object({
        key: z.string().min(1),
        globallyEnabled: z.boolean().optional(),
        enabledForPlans: z.array(z.string()).optional(),
        enabledForOrgs: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createServiceClient()
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.globallyEnabled !== undefined) patch.globally_enabled = input.globallyEnabled
      if (input.enabledForPlans !== undefined) patch.enabled_for_plans = input.enabledForPlans
      if (input.enabledForOrgs !== undefined) patch.enabled_for_orgs = input.enabledForOrgs
      const { error } = await supabase.from('feature_flags').update(patch).eq('key', input.key)
      if (error) throw error
      return { success: true }
    }),

  // ─── Add-ons catalog + per-org management ────────────────────────────
  addonCatalog: superAdminProcedure.query(async () => {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('addon_catalog').select('*').eq('enabled', true)
    if (error) throw error
    return data ?? []
  }),

  grantAddon: superAdminProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        addonKey: z.string().min(1),
        quantity: z.number().int().min(1).max(100).default(1),
        activeTo: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createServiceClient()

      // Look up the catalog entry for display_name + price.
      const { data: catalog } = await supabase
        .from('addon_catalog')
        .select('*')
        .eq('addon_key', input.addonKey)
        .single()
      if (!catalog) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Add-on não encontrado' })
      }

      const { error } = await supabase
        .from('plan_addons')
        .upsert(
          {
            organization_id: input.orgId,
            addon_key: input.addonKey,
            stripe_price_id: catalog.stripe_price_id,
            display_name: catalog.display_name,
            monthly_price_brl: catalog.monthly_price_brl,
            quantity: input.quantity,
            active: true,
            active_to: input.activeTo ?? null,
          },
          { onConflict: 'organization_id,addon_key' }
        )
      if (error) throw error
      return { success: true }
    }),

  revokeAddon: superAdminProcedure
    .input(z.object({ orgId: z.string().uuid(), addonKey: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createServiceClient()
      const { error } = await supabase
        .from('plan_addons')
        .update({ active: false, active_to: new Date().toISOString() })
        .eq('organization_id', input.orgId)
        .eq('addon_key', input.addonKey)
      if (error) throw error
      return { success: true }
    }),
})
