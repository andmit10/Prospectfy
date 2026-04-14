import { router, protectedProcedure } from '@/lib/trpc'

export const dashboardRouter = router({
  metrics: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.user.id
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch user's lead IDs first (avoids unsupported subquery syntax)
    const { data: userLeads } = await ctx.supabase
      .from('leads')
      .select('id, status_pipeline')
      .eq('user_id', uid)
      .is('deleted_at', null)

    const allLeadIds = (userLeads ?? []).map((l) => l.id)
    const activeLeadIds = (userLeads ?? [])
      .filter((l) => !['convertido', 'perdido'].includes(l.status_pipeline))
      .map((l) => l.id)

    // Pipeline counts
    const pipeline: Record<string, number> = {
      novo: 0, contatado: 0, respondeu: 0, reuniao: 0, convertido: 0, perdido: 0,
    }
    for (const l of userLeads ?? []) {
      pipeline[l.status_pipeline] = (pipeline[l.status_pipeline] ?? 0) + 1
    }

    const [campaignsActive, sentLast30, repliedLast30, meetingsLast30] = await Promise.all([
      ctx.supabase
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status', 'ativa'),

      allLeadIds.length > 0
        ? ctx.supabase
            .from('interactions')
            .select('id', { count: 'exact', head: true })
            .eq('tipo', 'enviado')
            .gte('created_at', thirtyDaysAgo)
            .in('lead_id', allLeadIds)
        : Promise.resolve({ count: 0 }),

      allLeadIds.length > 0
        ? ctx.supabase
            .from('interactions')
            .select('lead_id', { count: 'exact', head: true })
            .eq('tipo', 'respondido')
            .gte('created_at', thirtyDaysAgo)
            .in('lead_id', allLeadIds)
        : Promise.resolve({ count: 0 }),

      ctx.supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('status_pipeline', 'reuniao')
        .gte('updated_at', thirtyDaysAgo),
    ])

    return {
      leadsActive: activeLeadIds.length,
      campaignsActive: campaignsActive.count ?? 0,
      sentLast30: sentLast30.count ?? 0,
      repliedLast30: repliedLast30.count ?? 0,
      meetingsLast30: meetingsLast30.count ?? 0,
      pipeline,
    }
  }),

  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    const { data: userLeads } = await ctx.supabase
      .from('leads')
      .select('id')
      .eq('user_id', ctx.user.id)
      .is('deleted_at', null)
      .limit(500)

    const leadIds = (userLeads ?? []).map((l) => l.id)
    if (leadIds.length === 0) return []

    const { data } = await ctx.supabase
      .from('interactions')
      .select('id, tipo, created_at, lead_id, leads(decisor_nome, empresa_nome)')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
      .limit(10)

    return (data ?? []).map((item) => ({
      ...item,
      leads: Array.isArray(item.leads) ? item.leads[0] ?? null : item.leads,
    }))
  }),
})
