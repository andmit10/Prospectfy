import { z } from 'zod'
import { router, protectedProcedure } from '@/lib/trpc'

const cadenciaStepInput = z.object({
  step_order: z.number().int().positive(),
  canal: z.enum(['whatsapp', 'email', 'linkedin', 'landing_page']),
  delay_hours: z.number().int().min(0),
  mensagem_template: z.string().min(1),
  tipo_mensagem: z.enum(['texto', 'imagem', 'documento', 'audio']).default('texto'),
  ativo: z.boolean().default(true),
})

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
        steps: z.array(cadenciaStepInput).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { steps, ...campaignData } = input

      const { data: campaign, error } = await ctx.supabase
        .from('campaigns')
        .insert({ ...campaignData, user_id: ctx.user.id, status: 'rascunho' })
        .select()
        .single()

      if (error) throw error

      if (steps.length > 0) {
        const { error: stepsError } = await ctx.supabase
          .from('cadencia_steps')
          .insert(steps.map((s) => ({ ...s, campaign_id: campaign.id })))

        if (stepsError) throw stepsError
      }

      return campaign
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

  upsertSteps: protectedProcedure
    .input(
      z.object({
        campaign_id: z.string().uuid(),
        steps: z.array(cadenciaStepInput),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const { data: campaign } = await ctx.supabase
        .from('campaigns')
        .select('id')
        .eq('id', input.campaign_id)
        .eq('user_id', ctx.user.id)
        .single()

      if (!campaign) throw new Error('Campaign not found')

      // Delete existing steps and re-insert
      await ctx.supabase
        .from('cadencia_steps')
        .delete()
        .eq('campaign_id', input.campaign_id)

      if (input.steps.length > 0) {
        const { error } = await ctx.supabase
          .from('cadencia_steps')
          .insert(input.steps.map((s) => ({ ...s, campaign_id: input.campaign_id })))

        if (error) throw error
      }

      return { success: true }
    }),
})
