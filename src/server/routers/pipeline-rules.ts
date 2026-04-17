import { z } from 'zod'
import { router, orgProcedure, writerProcedure, adminProcedure } from '@/lib/trpc'

const TRIGGER_VALUES = [
  'click',
  'reply_positive',
  'reply_negative',
  'reply_question',
  'reply_unsubscribe',
  'meeting_requested',
  'no_response_days',
  'score_threshold',
] as const

const STAGE_VALUES = ['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'] as const

export const pipelineRulesRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('pipeline_rules')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('priority', { ascending: true })
    if (error) throw error
    return data ?? []
  }),

  create: writerProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        triggerType: z.enum(TRIGGER_VALUES),
        triggerConfig: z.record(z.string(), z.unknown()).default({}),
        fromStage: z.enum(STAGE_VALUES).nullable().optional(),
        toStage: z.enum(STAGE_VALUES),
        priority: z.number().int().min(0).max(1000).default(100),
        addTags: z.array(z.string()).default([]),
        removeTags: z.array(z.string()).default([]),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pipeline_rules')
        .insert({
          organization_id: ctx.orgId,
          name: input.name,
          enabled: input.enabled,
          priority: input.priority,
          trigger_type: input.triggerType,
          trigger_config: input.triggerConfig,
          from_stage: input.fromStage ?? null,
          to_stage: input.toStage,
          add_tags: input.addTags,
          remove_tags: input.removeTags,
          created_by: ctx.user.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    }),

  update: writerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        enabled: z.boolean().optional(),
        priority: z.number().int().min(0).max(1000).optional(),
        triggerType: z.enum(TRIGGER_VALUES).optional(),
        triggerConfig: z.record(z.string(), z.unknown()).optional(),
        fromStage: z.enum(STAGE_VALUES).nullable().optional(),
        toStage: z.enum(STAGE_VALUES).optional(),
        addTags: z.array(z.string()).optional(),
        removeTags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.enabled !== undefined) patch.enabled = input.enabled
      if (input.priority !== undefined) patch.priority = input.priority
      if (input.triggerType !== undefined) patch.trigger_type = input.triggerType
      if (input.triggerConfig !== undefined) patch.trigger_config = input.triggerConfig
      if (input.fromStage !== undefined) patch.from_stage = input.fromStage
      if (input.toStage !== undefined) patch.to_stage = input.toStage
      if (input.addTags !== undefined) patch.add_tags = input.addTags
      if (input.removeTags !== undefined) patch.remove_tags = input.removeTags

      const { error } = await ctx.supabase
        .from('pipeline_rules')
        .update(patch)
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
      if (error) throw error
      return { success: true }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('pipeline_rules')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
      if (error) throw error
      return { success: true }
    }),

  /** Recent applications for the active org — useful for an audit dashboard. */
  recentApplications: orgProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('pipeline_rule_applications')
        .select(
          'id, rule_id, lead_id, from_stage, to_stage, source_event_type, applied_at, pipeline_rules(name, trigger_type)'
        )
        .eq('organization_id', ctx.orgId)
        .order('applied_at', { ascending: false })
        .limit(input.limit)
      if (error) throw error
      return data ?? []
    }),

  /** Tracking-link list for the UI. */
  listTrackingLinks: orgProcedure
    .input(z.object({ leadId: z.string().uuid().optional(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('tracking_links')
        .select('id, short_code, target_url, label, click_count, unique_click_count, first_click_at, last_click_at, created_at, lead_id')
        .eq('organization_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(input.limit)
      if (input.leadId) query = query.eq('lead_id', input.leadId)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    }),
})
