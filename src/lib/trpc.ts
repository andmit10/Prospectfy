import { initTRPC, TRPCError } from '@trpc/server'
import { createClient } from '@/lib/supabase/server'
import { bootstrapPersonalOrg } from '@/lib/org-context'
import superjson from 'superjson'
import { ZodError } from 'zod'

export async function createContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

export type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

/**
 * orgProcedure — like protectedProcedure, but also resolves the caller's
 * current organization and role. Throws if the user has no org membership
 * (which should only happen during the window of a half-applied multi-tenant
 * migration — the `handle_new_user` trigger auto-creates a personal org).
 *
 * Resolution precedence for ctx.orgId:
 *  1. profiles.current_organization_id (persisted active org from the switcher)
 *  2. First joined org (fallback for accounts without current set)
 *
 * Returns:
 *  - ctx.orgId: uuid
 *  - ctx.orgRole: 'super_admin' | 'org_admin' | 'member' | 'viewer'
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // 1. Try the persisted current org.
  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('current_organization_id')
    .eq('id', ctx.user.id)
    .maybeSingle()

  let orgId = profile?.current_organization_id ?? null

  // 2. Fallback — pick the first (oldest) membership. Also backfills
  //    profiles.current_organization_id so subsequent requests skip this.
  if (!orgId) {
    const { data: firstMembership } = await ctx.supabase
      .from('org_members')
      .select('org_id, joined_at')
      .eq('user_id', ctx.user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    orgId = firstMembership?.org_id ?? null

    if (orgId) {
      await ctx.supabase
        .from('profiles')
        .update({ current_organization_id: orgId, updated_at: new Date().toISOString() })
        .eq('id', ctx.user.id)
    }
  }

  // Auto-heal: caller is authenticated but has no membership. Bootstrap a
  // personal org so they can use the app. Only fires when strictly needed
  // (no membership exists) — idempotent in practice because subsequent
  // calls find the row via the query above.
  if (!orgId) {
    orgId = await bootstrapPersonalOrg(ctx.user.id)
    if (orgId) {
      await ctx.supabase
        .from('profiles')
        .update({
          current_organization_id: orgId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ctx.user.id)
    }
  }

  if (!orgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Não foi possível criar ou encontrar sua organização. Entre em contato com o suporte.',
    })
  }

  // Resolve role for the active org. This is the row that RLS will use to
  // authorize writes server-side, but we also expose it to the client for UI.
  const { data: membership } = await ctx.supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', ctx.user.id)
    .maybeSingle()

  if (!membership) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Sua conta não pertence mais a esta organização.',
    })
  }

  return next({
    ctx: {
      ...ctx,
      orgId: orgId as string,
      orgRole: membership.role as 'super_admin' | 'org_admin' | 'member' | 'viewer',
    },
  })
})

/**
 * writerProcedure — org member with write permission (org_admin or member).
 * Blocks viewers from mutations at the router level (RLS is the second gate).
 */
export const writerProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.orgRole === 'viewer') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Sua role não permite esta ação. Peça acesso ao admin da organização.',
    })
  }
  return next({ ctx })
})

/**
 * adminProcedure — org_admin (or super_admin) only. For invite/role changes,
 * billing, integrations.
 */
export const adminProcedure = orgProcedure.use(({ ctx, next }) => {
  if (ctx.orgRole !== 'org_admin' && ctx.orgRole !== 'super_admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Apenas administradores podem executar esta ação.',
    })
  }
  return next({ ctx })
})

/**
 * superAdminProcedure — platform-level admin (Orbya staff). Checks the
 * caller has a `super_admin` membership anywhere. Cross-org by design: the
 * procedure body should never filter by `ctx.orgId`, and should use the
 * service client for SQL that spans organizations.
 *
 * Adds `ctx.isPlatformAdmin: true` for the handler body to read.
 */
export const superAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const { data } = await ctx.supabase
    .from('org_members')
    .select('role')
    .eq('user_id', ctx.user.id)
    .eq('role', 'super_admin')
    .limit(1)
    .maybeSingle()

  if (!data) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Área restrita aos operadores da plataforma.',
    })
  }

  return next({
    ctx: {
      ...ctx,
      isPlatformAdmin: true as const,
    },
  })
})
