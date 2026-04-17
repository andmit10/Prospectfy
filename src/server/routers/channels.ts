import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, adminProcedure } from '@/lib/trpc'
import {
  encryptConfig,
  decryptConfig,
  redactConfigForUI,
  getProvider,
  dispatch,
  PROVIDER_CATALOG,
  type Channel,
} from '@/lib/channels'

/**
 * Channels router — manage `channel_integrations` + send test messages.
 *
 * Security:
 *   - All writes are admin-gated via `adminProcedure`.
 *   - Config is encrypted server-side with AES-256-GCM BEFORE hitting the
 *     DB; the plaintext never leaves the handler scope.
 *   - `list`/`get` return a redacted view for the UI (passwords/tokens are
 *     masked to the last 4 chars); the full decrypted config is only used
 *     internally by the dispatcher.
 */

const CHANNEL_VALUES = ['whatsapp', 'email', 'linkedin', 'instagram', 'sms'] as const

export const channelsRouter = router({
  /** Provider catalog for the UI — static list of what the platform supports. */
  catalog: orgProcedure.query(() => {
    return PROVIDER_CATALOG
  }),

  /** List integrations for the active org, with redacted config + health. */
  list: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('channel_integrations')
      .select(
        'id, channel, provider, display_name, config, status, last_error, last_error_at, consecutive_failures, is_default, connected_at, created_at, updated_at'
      )
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return (data ?? []).map((row) => {
      let decrypted: Record<string, unknown> = {}
      try {
        decrypted = decryptConfig(row.config as Record<string, unknown>)
      } catch {
        // Corrupted config → show empty; admin can recreate.
      }
      return {
        id: row.id as string,
        channel: row.channel as Channel,
        provider: row.provider as string,
        displayName: row.display_name as string,
        config: redactConfigForUI(decrypted),
        status: row.status as 'active' | 'error' | 'disconnected',
        lastError: row.last_error as string | null,
        lastErrorAt: row.last_error_at as string | null,
        consecutiveFailures: (row.consecutive_failures as number | null) ?? 0,
        isDefault: Boolean(row.is_default),
        connectedAt: row.connected_at as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }
    })
  }),

  /** Create a new integration — validates config via the provider adapter. */
  create: adminProcedure
    .input(
      z.object({
        channel: z.enum(CHANNEL_VALUES),
        provider: z.string().min(1),
        displayName: z.string().min(2).max(80),
        config: z.record(z.string(), z.unknown()),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = getProvider(input.channel, input.provider)
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Provider "${input.provider}" não registrado para canal ${input.channel}`,
        })
      }

      const validation = await provider.validateConfig(input.config)
      if (!validation.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.error })
      }

      // If isDefault, clear any existing default on this (org, channel) first.
      if (input.isDefault) {
        await ctx.supabase
          .from('channel_integrations')
          .update({ is_default: false })
          .eq('organization_id', ctx.orgId)
          .eq('channel', input.channel)
          .eq('is_default', true)
      }

      const encrypted = encryptConfig(validation.normalized)

      const { data, error } = await ctx.supabase
        .from('channel_integrations')
        .insert({
          organization_id: ctx.orgId,
          channel: input.channel,
          provider: input.provider,
          display_name: input.displayName,
          config: encrypted,
          is_default: input.isDefault,
          status: 'active',
          connected_at: new Date().toISOString(),
          created_by: ctx.user.id,
        })
        .select('id')
        .single()

      if (error) throw error
      return { id: data.id as string }
    }),

  /** Update a subset of fields. Pass a new `config` to rotate credentials. */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        displayName: z.string().min(2).max(80).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data: existing, error: fetchErr } = await ctx.supabase
        .from('channel_integrations')
        .select('id, channel, provider')
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
        .single()

      if (fetchErr || !existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integração não encontrada' })
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.displayName) patch.display_name = input.displayName

      if (input.config !== undefined) {
        const provider = getProvider(existing.channel as Channel, existing.provider as string)
        if (!provider) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Provider desaparecido do registry',
          })
        }
        const validation = await provider.validateConfig(input.config)
        if (!validation.ok) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: validation.error })
        }
        patch.config = encryptConfig(validation.normalized)
        // Config rotation resets the failure counter and status.
        patch.consecutive_failures = 0
        patch.status = 'active'
        patch.last_error = null
        patch.last_error_at = null
      }

      if (input.isDefault === true) {
        await ctx.supabase
          .from('channel_integrations')
          .update({ is_default: false })
          .eq('organization_id', ctx.orgId)
          .eq('channel', existing.channel)
          .eq('is_default', true)
          .neq('id', input.id)
        patch.is_default = true
      } else if (input.isDefault === false) {
        patch.is_default = false
      }

      const { error } = await ctx.supabase
        .from('channel_integrations')
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
        .from('channel_integrations')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)
      if (error) throw error
      return { success: true }
    }),

  /** Send a test message — useful to verify credentials without going through
   *  the agent loop. Never uses lead data; the recipient is provided directly. */
  sendTest: adminProcedure
    .input(
      z.object({
        integrationId: z.string().uuid(),
        to: z.string().min(1).max(200),
        content: z.string().min(1).max(1000),
        subject: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load the integration to learn its channel.
      const { data } = await ctx.supabase
        .from('channel_integrations')
        .select('channel')
        .eq('id', input.integrationId)
        .eq('organization_id', ctx.orgId)
        .single()
      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integração não encontrada' })
      }

      const outcome = await dispatch({
        orgId: ctx.orgId,
        channel: data.channel as Channel,
        integrationId: input.integrationId,
        payload: {
          to: input.to,
          content: input.content,
          subject: input.subject,
        },
      })

      if (!outcome.ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: outcome.error ?? 'Falha ao enviar mensagem de teste',
        })
      }
      return outcome
    }),

  /** List recent channel_messages for the active org. */
  listMessages: orgProcedure
    .input(
      z.object({
        leadId: z.string().uuid().optional(),
        integrationId: z.string().uuid().optional(),
        channel: z.enum(CHANNEL_VALUES).optional(),
        limit: z.number().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('channel_messages')
        .select(
          'id, channel, direction, integration_id, lead_id, subject, content, status, sent_at, delivered_at, read_at, replied_at, failed_at, created_at'
        )
        .eq('organization_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (input.leadId) query = query.eq('lead_id', input.leadId)
      if (input.integrationId) query = query.eq('integration_id', input.integrationId)
      if (input.channel) query = query.eq('channel', input.channel)

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    }),
})
