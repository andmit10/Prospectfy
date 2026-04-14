import { z } from 'zod'
import { router, protectedProcedure } from '@/lib/trpc'

export const leadsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().default(1),
        pageSize: z.number().default(50),
        status: z.string().optional(),
        campaignId: z.string().uuid().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, campaignId, search } = input
      const from = (page - 1) * pageSize

      let query = ctx.supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('user_id', ctx.user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (status) query = query.eq('status_pipeline', status)
      if (campaignId) query = query.eq('campaign_id', campaignId)
      if (search) {
        query = query.or(
          `decisor_nome.ilike.%${search}%,empresa_nome.ilike.%${search}%`
        )
      }

      const { data, error, count } = await query

      if (error) throw error
      return { leads: data ?? [], total: count ?? 0 }
    }),

  getById: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('leads')
        .select('*, interactions(*)')
        .eq('id', input)
        .eq('user_id', ctx.user.id)
        .is('deleted_at', null)
        .single()

      if (error) throw error
      return data
    }),

  create: protectedProcedure
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
        .insert({ ...input, user_id: ctx.user.id, fonte: 'manual' })
        .select()
        .single()

      if (error) throw error
      return data
    }),

  update: protectedProcedure
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
        .eq('user_id', ctx.user.id)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  softDelete: protectedProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('leads')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input)
        .eq('user_id', ctx.user.id)

      if (error) throw error
      return { success: true }
    }),
})
