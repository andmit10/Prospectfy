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
import {
  createInstance as evoCreateInstance,
  connectInstance as evoConnectInstance,
  disconnectInstance as evoDisconnectInstance,
} from '@/lib/channels/providers/whatsapp/evolution-go-admin'
import {
  createHostedAuthLink as unipileCreateHostedAuthLink,
  isManagedAvailable as unipileManagedAvailable,
} from '@/lib/channels/providers/linkedin/unipile-admin'
import { serverEnv } from '@/lib/env.server'
import { createServiceClient } from '@/lib/supabase/service'

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

  /**
   * Provision a WhatsApp instance on the SHARED Evolution Go server.
   *
   * Flow:
   *   1. Validate plan limit: count(channel_integrations where channel='whatsapp' and status != 'disconnected')
   *      must be < plan_catalog.max_channels. Disconnected slots don't count.
   *   2. Validate name uniqueness within the org (slug-friendly).
   *   3. Call Evolution Go: POST /instance/create → instanceId + token.
   *   4. Insert channel_integrations row with status='disconnected', metadata={ instance_id }.
   *   5. Call Evolution Go: POST /instance/connect with our webhook URL → triggers QRCode event.
   *   6. The webhook handler will populate metadata.qr_code and flip status to 'active' on Connected.
   *
   * Returns the new integration id so the UI can poll getQRCode.
   */
  provisionWhatsapp: adminProcedure
    .input(
      z.object({
        instanceName: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, _ ou -'),
        displayName: z.string().min(2).max(80),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!serverEnv.EVOLUTION_GO_SHARED_BASE_URL || !serverEnv.EVOLUTION_GO_SHARED_GLOBAL_API_KEY) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Servidor WhatsApp compartilhado não configurado. Contate o suporte.',
        })
      }

      // ── 1. Plan limit check ────────────────────────────────────────────
      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('plan, slug')
        .eq('id', ctx.orgId)
        .single()

      const [{ data: planRow }, { count: existingCount }] = await Promise.all([
        ctx.supabase
          .from('plan_catalog')
          .select('max_channels')
          .eq('plan', (org?.plan as string) ?? 'trial')
          .maybeSingle(),
        ctx.supabase
          .from('channel_integrations')
          .select('id', { head: true, count: 'exact' })
          .eq('organization_id', ctx.orgId)
          .eq('channel', 'whatsapp')
          .neq('status', 'disconnected'),
      ])

      const max = (planRow?.max_channels as number | null) ?? 1
      if ((existingCount ?? 0) >= max) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Limite do plano atingido: ${max} WhatsApp${max === 1 ? '' : 's'}. Faça upgrade para conectar mais números.`,
        })
      }

      // ── 2. Uniqueness check (Evolution Go server names are global per server) ──
      // We prefix the org slug to reduce collision risk across tenants.
      const baseSlug = (org?.slug as string | undefined) ?? 'org'
      const fullName = `${baseSlug}_${input.instanceName}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)

      // ── 3. Create instance on Evolution Go ─────────────────────────────
      let created: { id: string; token: string; name: string }
      try {
        created = await evoCreateInstance(fullName)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // 409 collision → instruct user to pick a different name
        if (/409/.test(msg)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Já existe uma instância com esse nome. Escolha outro.',
          })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
      }

      // ── 4. Insert integration row (status starts as 'disconnected'; webhook flips to 'active') ──
      const integrationConfig = {
        baseUrl: serverEnv.EVOLUTION_GO_SHARED_BASE_URL,
        instanceToken: created.token,
        instanceName: created.name,
        instanceId: created.id,
        ignoreTls: serverEnv.EVOLUTION_GO_SHARED_IGNORE_TLS,
      }
      const encrypted = encryptConfig(integrationConfig)

      const { data: newRow, error: insertErr } = await ctx.supabase
        .from('channel_integrations')
        .insert({
          organization_id: ctx.orgId,
          channel: 'whatsapp',
          provider: 'evolution_go',
          display_name: input.displayName,
          config: encrypted,
          status: 'disconnected',
          is_default: (existingCount ?? 0) === 0,
          metadata: { instance_id: created.id, provisioned_at: new Date().toISOString() },
          created_by: ctx.user.id,
        })
        .select('id')
        .single()

      if (insertErr || !newRow) {
        // Rollback the instance on Evolution Go to avoid orphans.
        const { deleteInstance } = await import('@/lib/channels/providers/whatsapp/evolution-go-admin')
        await deleteInstance(created.id).catch(() => {})
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: insertErr?.message ?? 'Falha ao gravar integração',
        })
      }

      // ── 5. Configure webhook + start pairing ────────────────────────────
      const webhookUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/api/webhooks/channels/whatsapp/evolution_go?integration=${newRow.id}`
      try {
        await evoConnectInstance({
          instanceId: created.id,
          instanceToken: created.token,
          webhookUrl,
        })
      } catch (err) {
        // Roll back DB + remote instance — leaving a half-configured row is worse.
        await ctx.supabase.from('channel_integrations').delete().eq('id', newRow.id)
        const { deleteInstance } = await import('@/lib/channels/providers/whatsapp/evolution-go-admin')
        await deleteInstance(created.id).catch(() => {})
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        })
      }

      return {
        integrationId: newRow.id as string,
        instanceId: created.id,
      }
    }),

  /** Poll endpoint for the live QR code while the user pairs. */
  getWhatsappQR: orgProcedure
    .input(z.object({ integrationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('channel_integrations')
        .select('status, metadata, connected_at')
        .eq('id', input.integrationId)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integração não encontrada' })
      }
      const meta = (data.metadata as Record<string, unknown> | null) ?? {}
      return {
        status: data.status as 'active' | 'error' | 'disconnected',
        connectedAt: data.connected_at as string | null,
        qrCode: (meta.qr_code as string | null) ?? null,
        qrUpdatedAt: (meta.qr_updated_at as string | null) ?? null,
      }
    }),

  /** Manual disconnect — keeps the row, marks status, lets user reconnect later. */
  disconnectWhatsapp: adminProcedure
    .input(z.object({ integrationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('channel_integrations')
        .select('id, channel, provider, metadata')
        .eq('id', input.integrationId)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integração não encontrada' })
      }
      if (data.provider !== 'evolution_go') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Disconnect automático só está disponível para Evolution Go.',
        })
      }
      const instanceId = (data.metadata as Record<string, unknown> | null)?.instance_id as
        | string
        | undefined
      if (instanceId) {
        await evoDisconnectInstance(instanceId).catch(() => {
          // Best-effort: server side may already be gone. We still mark local state.
        })
      }
      const supabase = createServiceClient()
      await supabase
        .from('channel_integrations')
        .update({
          status: 'disconnected',
          metadata: {
            ...((data.metadata as Record<string, unknown> | null) ?? {}),
            disconnected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.integrationId)
      return { success: true }
    }),

  /**
   * Returns whether the Managed Unipile option is available in this
   * environment. When false, the UI hides the "Prospectfy gerencia"
   * card and only offers BYOU.
   */
  linkedinManagedAvailable: orgProcedure.query(() => {
    return { available: unipileManagedAvailable() }
  }),

  /**
   * Provision a Managed Unipile LinkedIn integration.
   *
   * Flow:
   *   1. Plan limit check (max_channels). Disconnected slots don't count.
   *   2. Insert channel_integrations row (provider='unipile', status='disconnected',
   *      metadata.managed=true) — config carries operator DSN+apiKey; accountId
   *      comes later from the webhook.
   *   3. Create a plan_addons row (addon_key='linkedin_unipile', quantity=1)
   *      so the Stripe webhook sync can pick it up on the next renewal.
   *   4. Call Unipile hosted auth → returns URL for the customer's new tab.
   *
   * Returns { integrationId, authUrl }.
   */
  provisionLinkedinManaged: adminProcedure.mutation(async ({ ctx }) => {
    if (!unipileManagedAvailable()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Unipile Managed não está configurado neste ambiente. Use o modo BYOU (Bring Your Own Unipile).',
      })
    }

    // 1. Plan limit
    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('plan')
      .eq('id', ctx.orgId)
      .single()

    const [{ data: planRow }, { count: existingCount }] = await Promise.all([
      ctx.supabase
        .from('plan_catalog')
        .select('max_channels')
        .eq('plan', (org?.plan as string) ?? 'trial')
        .maybeSingle(),
      ctx.supabase
        .from('channel_integrations')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', ctx.orgId)
        .eq('channel', 'linkedin')
        .neq('status', 'disconnected'),
    ])

    const max = (planRow?.max_channels as number | null) ?? 1
    if ((existingCount ?? 0) >= max) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Limite do plano atingido: ${max} canal${max === 1 ? '' : 'es'} LinkedIn. Faça upgrade para conectar mais contas.`,
      })
    }

    // 2. Create integration row — config has operator credentials; accountId
    //    is populated by the webhook when the customer finishes logging in.
    const integrationConfig = {
      dsn: serverEnv.UNIPILE_MANAGED_DSN!,
      apiKey: serverEnv.UNIPILE_MANAGED_API_KEY!,
      accountId: '', // filled by webhook
    }
    const encrypted = encryptConfig(integrationConfig)

    const { data: newRow, error: insertErr } = await ctx.supabase
      .from('channel_integrations')
      .insert({
        organization_id: ctx.orgId,
        channel: 'linkedin',
        provider: 'unipile',
        display_name: 'LinkedIn (Managed)',
        config: encrypted,
        status: 'disconnected',
        is_default: (existingCount ?? 0) === 0,
        metadata: {
          managed: true,
          auth_pending: true,
          provisioned_at: new Date().toISOString(),
        },
        created_by: ctx.user.id,
      })
      .select('id')
      .single()

    if (insertErr || !newRow) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: insertErr?.message ?? 'Falha ao gravar integração',
      })
    }

    // 3. Addon row (so Stripe sync picks it up on next billing cycle).
    //    Upsert in case there's already a row for this addon_key + org.
    {
      const supabase = createServiceClient()
      const { data: existing } = await supabase
        .from('plan_addons')
        .select('id, quantity, active')
        .eq('organization_id', ctx.orgId)
        .eq('addon_key', 'linkedin_unipile')
        .maybeSingle()
      if (existing) {
        await supabase
          .from('plan_addons')
          .update({
            quantity: (existing.quantity as number) + 1,
            active: true,
            active_to: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('plan_addons').insert({
          organization_id: ctx.orgId,
          addon_key: 'linkedin_unipile',
          display_name: 'LinkedIn (Unipile)',
          monthly_price_brl: 299,
          quantity: 1,
          active: true,
          active_from: new Date().toISOString(),
          metadata: { source: 'managed_provision', integration_id: newRow.id },
        })
      }
    }

    // 4. Hosted auth link
    try {
      const link = await unipileCreateHostedAuthLink({ integrationId: newRow.id as string })
      return { integrationId: newRow.id as string, authUrl: link.url }
    } catch (err) {
      // Roll back the row + addon decrement on failure.
      await ctx.supabase.from('channel_integrations').delete().eq('id', newRow.id)
      // Soft-decrement addon — we don't know if it's 0 before or after.
      const supabase = createServiceClient()
      const { data: addonRow } = await supabase
        .from('plan_addons')
        .select('id, quantity')
        .eq('organization_id', ctx.orgId)
        .eq('addon_key', 'linkedin_unipile')
        .maybeSingle()
      if (addonRow) {
        const next = Math.max(0, (addonRow.quantity as number) - 1)
        await supabase
          .from('plan_addons')
          .update({
            quantity: next,
            active: next > 0,
            active_to: next > 0 ? null : new Date().toISOString(),
          })
          .eq('id', addonRow.id)
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }),

  /** Poll for LinkedIn connection status while the customer completes hosted auth. */
  getLinkedinConnectionStatus: orgProcedure
    .input(z.object({ integrationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('channel_integrations')
        .select('status, connected_at, metadata')
        .eq('id', input.integrationId)
        .eq('organization_id', ctx.orgId)
        .single()
      if (error || !data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Integração não encontrada' })
      }
      return {
        status: data.status as 'active' | 'error' | 'disconnected',
        connectedAt: data.connected_at as string | null,
        authPending: Boolean(
          ((data.metadata as Record<string, unknown> | null) ?? {}).auth_pending
        ),
      }
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
