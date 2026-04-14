import { z } from 'zod'
import { router, protectedProcedure } from '@/lib/trpc'

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
  }),

  getById: protectedProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .select('*, cadencia_steps(*)')
        .eq('id', input)
        .eq('user_id', ctx.user.id)
        .single()

      if (error) throw error
      return data
    }),

  create: protectedProcedure
    .input(
      z.object({
        nome: z.string().min(1),
        descricao: z.string().optional(),
        meta_reunioes: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .insert({ ...input, user_id: ctx.user.id, status: 'rascunho' })
        .select()
        .single()

      if (error) throw error
      return data
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        nome: z.string().min(1).optional(),
        descricao: z.string().optional(),
        status: z.enum(['rascunho', 'ativa', 'pausada', 'concluida']).optional(),
        meta_reunioes: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', ctx.user.id)
        .select()
        .single()

      if (error) throw error
      return data
    }),
})
