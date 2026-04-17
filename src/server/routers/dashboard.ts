import { router, orgProcedure } from '@/lib/trpc'

export const dashboardRouter = router({
  metrics: orgProcedure.query(async ({ ctx }) => {
    const orgId = ctx.orgId
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch org's lead IDs first (avoids unsupported subquery syntax)
    const { data: orgLeads } = await ctx.supabase
      .from('leads')
      .select('id, status_pipeline')
      .eq('organization_id', orgId)
      .is('deleted_at', null)

    const allLeadIds = (orgLeads ?? []).map((l) => l.id)
    const activeLeadIds = (orgLeads ?? [])
      .filter((l) => !['convertido', 'perdido'].includes(l.status_pipeline))
      .map((l) => l.id)

    // Pipeline counts
    const pipeline: Record<string, number> = {
      novo: 0, contatado: 0, respondeu: 0, reuniao: 0, convertido: 0, perdido: 0,
    }
    for (const l of orgLeads ?? []) {
      pipeline[l.status_pipeline] = (pipeline[l.status_pipeline] ?? 0) + 1
    }

    const [campaignsActive, sentLast30, repliedLast30, meetingsLast30] = await Promise.all([
      ctx.supabase
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
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
        .eq('organization_id', orgId)
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

  recentActivity: orgProcedure.query(async ({ ctx }) => {
    const { data: orgLeads } = await ctx.supabase
      .from('leads')
      .select('id')
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .limit(500)

    const leadIds = (orgLeads ?? []).map((l) => l.id)
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
