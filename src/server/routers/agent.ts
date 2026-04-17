import { z } from 'zod'
import { router, orgProcedure } from '@/lib/trpc'

export const agentRouter = router({
  /** Queue stats for the active organization */
  queueStats: orgProcedure.query(async ({ ctx }) => {
    // Fetch leads belonging to the active org (RLS + explicit filter for
    // index selectivity).
    const { data: orgLeads } = await ctx.supabase
      .from('leads')
      .select('id')
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)

    const leadIds = (orgLeads ?? []).map((l) => l.id)
    if (leadIds.length === 0) {
      return { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 }
    }

    const [pending, processing, completed, failed] = await Promise.all([
      ctx.supabase
        .from('agent_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .in('lead_id', leadIds),
      ctx.supabase
        .from('agent_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'processing')
        .in('lead_id', leadIds),
      ctx.supabase
        .from('agent_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .in('lead_id', leadIds),
      ctx.supabase
        .from('agent_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .in('lead_id', leadIds),
    ])

    const p = pending.count ?? 0
    const pr = processing.count ?? 0
    const c = completed.count ?? 0
    const f = failed.count ?? 0
    return { pending: p, processing: pr, completed: c, failed: f, total: p + pr + c + f }
  }),

  /** Recent agent jobs with lead info (scoped to active org) */
  recentJobs: orgProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const { data: orgLeads } = await ctx.supabase
        .from('leads')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)

      const leadIds = (orgLeads ?? []).map((l) => l.id)
      if (leadIds.length === 0) return []

      const { data } = await ctx.supabase
        .from('agent_queue')
        .select(
          'id, status, scheduled_at, processed_at, attempts, last_error, lead_id, leads(decisor_nome, empresa_nome), cadencia_steps(step_order, canal)'
        )
        .in('lead_id', leadIds)
        .order('scheduled_at', { ascending: false })
        .limit(input.limit)

      return (data ?? []).map((job) => ({
        ...job,
        leads: Array.isArray(job.leads) ? job.leads[0] ?? null : job.leads,
        cadencia_steps: Array.isArray(job.cadencia_steps)
          ? job.cadencia_steps[0] ?? null
          : job.cadencia_steps,
      }))
    }),

  /** Recent agent reasoning logs from interactions (scoped to active org) */
  recentReasoning: orgProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      const { data: orgLeads } = await ctx.supabase
        .from('leads')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)

      const leadIds = (orgLeads ?? []).map((l) => l.id)
      if (leadIds.length === 0) return []

      const { data } = await ctx.supabase
        .from('interactions')
        .select(
          'id, tipo, canal, mensagem_enviada, agent_reasoning, created_at, lead_id, leads(decisor_nome, empresa_nome)'
        )
        .in('lead_id', leadIds)
        .not('agent_reasoning', 'is', null)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      return (data ?? []).map((item) => ({
        ...item,
        leads: Array.isArray(item.leads) ? item.leads[0] ?? null : item.leads,
      }))
    }),
})
