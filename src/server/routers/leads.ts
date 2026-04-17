import { z } from 'zod'
import { router, orgProcedure, writerProcedure } from '@/lib/trpc'

export const leadsRouter = router({
  list: orgProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
        status: z.string().optional(),
        campaignId: z.string().uuid().optional(),
        pipelineId: z.string().uuid().nullable().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, campaignId, pipelineId, segmento, cidade, search } = input
      const from = (page - 1) * pageSize

      let query = ctx.supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (status) query = query.eq('status_pipeline', status)
      if (campaignId) query = query.eq('campaign_id', campaignId)
      if (pipelineId === null) {
        // Explicit null means "sem pipeline"
        query = query.is('pipeline_id', null)
      } else if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
      }
      if (segmento) query = query.ilike('segmento', `%${segmento}%`)
      if (cidade) query = query.ilike('cidade', `%${cidade}%`)
      if (search) {
        query = query.or(
          `decisor_nome.ilike.%${search}%,empresa_nome.ilike.%${search}%`
        )
      }

      const { data, error, count } = await query

      if (error) throw error
      return { leads: data ?? [], total: count ?? 0 }
    }),

  getById: orgProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('leads')
        .select('*, interactions(*)')
        .eq('id', input)
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .single()

      if (error) throw error
      return data
    }),

  create: writerProcedure
    .input(
      z.object({
        empresa_nome: z.string().min(1),
        decisor_nome: z.string().min(1),
        whatsapp: z.string().min(10),
        cnpj: z.string().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        decisor_cargo: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        linkedin_url: z.string().url().optional().or(z.literal('')),
        telefone: z.string().optional(),
        tags: z.array(z.string()).default([]),
        campaign_id: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('leads')
        .insert({
          ...input,
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // kept as "creator" audit field
          fonte: 'manual',
        })
        .select()
        .single()

      if (error) throw error
      return data
    }),

  update: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        empresa_nome: z.string().min(1).optional(),
        decisor_nome: z.string().min(1).optional(),
        whatsapp: z.string().min(10).optional(),
        decisor_cargo: z.string().optional(),
        segmento: z.string().optional(),
        cidade: z.string().optional(),
        estado: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        status_pipeline: z
          .enum(['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'])
          .optional(),
        tags: z.array(z.string()).optional(),
        campaign_id: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('leads')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  softDelete: writerProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input)
        .eq('organization_id', ctx.orgId)

      if (error) throw error
      return { success: true }
    }),

  bulkUpdateTags: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      addTags: z.array(z.string()).default([]),
      removeTags: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { leadIds, addTags, removeTags } = input

      // Fetch current leads (scoped to org)
      const { data: leads, error: fetchError } = await ctx.supabase
        .from('leads')
        .select('id, tags')
        .eq('organization_id', ctx.orgId)
        .in('id', leadIds)
        .is('deleted_at', null)

      if (fetchError) throw fetchError

      // Update each lead's tags
      const updates = (leads ?? []).map(lead => {
        let tags = lead.tags ?? []
        tags = [...new Set([...tags, ...addTags])]
        tags = tags.filter((t: string) => !removeTags.includes(t))
        return ctx.supabase
          .from('leads')
          .update({ tags, updated_at: new Date().toISOString() })
          .eq('id', lead.id)
          .eq('organization_id', ctx.orgId)
      })

      await Promise.all(updates)
      return { updated: leads?.length ?? 0 }
    }),

  bulkMoveCampaign: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      campaignId: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ campaign_id: input.campaignId, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)
        .is('deleted_at', null)

      if (error) throw error
      return { updated: input.leadIds.length }
    }),

  bulkUpdateStatus: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
      status: z.enum(['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ status_pipeline: input.status, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)
        .is('deleted_at', null)

      if (error) throw error
      return { updated: input.leadIds.length }
    }),

  bulkDelete: writerProcedure
    .input(z.object({
      leadIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)

      if (error) throw error
      return { deleted: input.leadIds.length }
    }),
})
