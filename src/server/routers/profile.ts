import { z } from 'zod'
import { router, protectedProcedure } from '@/lib/trpc'

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('*')
      .eq('id', ctx.user.id)
      .single()

    if (error) throw error
    return data
  }),

  update: protectedProcedure
    .input(
      z.object({
        full_name: z.string().min(1).optional(),
        company_name: z.string().optional(),
        phone: z.string().optional(),
        directfy_api_key: z.string().optional(),
        calendly_url: z.string().url().optional().or(z.literal('')),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('profiles')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', ctx.user.id)
        .select()
        .single()

      if (error) throw error
      return data
    }),
})
