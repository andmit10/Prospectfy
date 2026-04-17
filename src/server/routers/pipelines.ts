import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, writerProcedure, adminProcedure } from '@/lib/trpc'

const DEFAULT_STAGES = ['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'] as const

export const pipelinesRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    // Every org member sees all pipelines in the active org. The legacy
    // `is_shared` column is kept for backwards-compat but no longer gates
    // visibility — the access boundary is organization_id.
    const { data, error } = await ctx.supabase
      .from('pipelines')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw error
    return data ?? []
  }),

  getById: orgProcedure
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pipelines')
        .select('*')
        .eq('id', input)
        .eq('organization_id', ctx.orgId)
        .single()

      if (error) throw error
      return data
    }),

  getDefault: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('pipelines')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('is_default', true)
      .maybeSingle()

    if (error) throw error

    // Auto-create a default pipeline on first access if none exists.
    if (!data) {
      const { data: created, error: createErr } = await ctx.supabase
        .from('pipelines')
        .insert({
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // audit: creator
          nome: 'Pipeline Principal',
          descricao: 'Pipeline padrão',
          is_default: true,
          is_shared: false,
          stages: DEFAULT_STAGES,
        })
        .select()
        .single()
      if (createErr) throw createErr
      return created
    }

    return data
  }),

  create: writerProcedure
    .input(
      z.object({
        nome: z.string().min(1).max(60),
        descricao: z.string().max(240).optional(),
        is_shared: z.boolean().default(false),
        is_default: z.boolean().default(false),
        stages: z.array(z.string().min(1).max(40)).min(2).max(12).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pipelines')
        .insert({
          organization_id: ctx.orgId,
          user_id: ctx.user.id, // audit: creator
          nome: input.nome,
          descricao: input.descricao ?? null,
          is_shared: input.is_shared,
          is_default: input.is_default,
          stages: input.stages ?? DEFAULT_STAGES,
          color: input.color ?? '#2B88D8',
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
        nome: z.string().min(1).max(60).optional(),
        descricao: z.string().max(240).nullable().optional(),
        is_shared: z.boolean().optional(),
        is_default: z.boolean().optional(),
        stages: z.array(z.string().min(1).max(40)).min(2).max(12).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('pipelines')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  setDefault: writerProcedure
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pipelines')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', input)
        .eq('organization_id', ctx.orgId)
        .select()
        .single()

      if (error) throw error
      return data
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        moveLeadsTo: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent deleting the last pipeline: org must keep at least one.
      const { data: owned, error: listErr } = await ctx.supabase
        .from('pipelines')
        .select('id, is_default')
        .eq('organization_id', ctx.orgId)

      if (listErr) throw listErr
      if ((owned ?? []).length <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A organização precisa ter pelo menos um pipeline.',
        })
      }

      const target = owned?.find((p) => p.id === input.id)
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline não encontrado.' })
      }

      const moveTarget = input.moveLeadsTo ?? null
      if (moveTarget !== null) {
        // Validate the destination belongs to the same org
        const dest = owned?.find((p) => p.id === moveTarget)
        if (!dest) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Pipeline de destino inválido.',
          })
        }
      }
      await ctx.supabase
        .from('leads')
        .update({ pipeline_id: moveTarget, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .eq('pipeline_id', input.id)

      const { error } = await ctx.supabase
        .from('pipelines')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)

      if (error) throw error

      // If we just deleted the default, promote another one.
      if (target.is_default) {
        const next = owned?.find((p) => p.id !== input.id)
        if (next) {
          await ctx.supabase
            .from('pipelines')
            .update({ is_default: true })
            .eq('id', next.id)
            .eq('organization_id', ctx.orgId)
        }
      }

      return { success: true, movedTo: moveTarget }
    }),

  // Bulk-assign leads to a pipeline (optionally creating it inline).
  assignLeads: writerProcedure
    .input(
      z.object({
        leadIds: z.array(z.string().uuid()).min(1),
        pipelineId: z.string().uuid().optional(),
        createPipeline: z
          .object({
            nome: z.string().min(1).max(60),
            is_shared: z.boolean().default(false),
            is_default: z.boolean().default(false),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let pipelineId = input.pipelineId

      if (!pipelineId) {
        if (!input.createPipeline) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Informe pipelineId ou dados para criar um novo pipeline.',
          })
        }
        const { data: created, error: createErr } = await ctx.supabase
          .from('pipelines')
          .insert({
            organization_id: ctx.orgId,
            user_id: ctx.user.id, // audit: creator
            nome: input.createPipeline.nome,
            is_shared: input.createPipeline.is_shared,
            is_default: input.createPipeline.is_default,
            stages: DEFAULT_STAGES,
          })
          .select()
          .single()
        if (createErr) throw createErr
        pipelineId = created.id
      }

      const { error } = await ctx.supabase
        .from('leads')
        .update({ pipeline_id: pipelineId, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.orgId)
        .in('id', input.leadIds)
        .is('deleted_at', null)

      if (error) throw error
      return { updated: input.leadIds.length, pipelineId }
    }),
})
