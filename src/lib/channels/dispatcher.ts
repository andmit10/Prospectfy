import { createServiceClient } from '@/lib/supabase/service'
import { decryptConfig } from './crypto'
import type {
  Channel,
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from './types'

/**
 * Channel dispatcher — the single entrypoint for sending messages. Call
 * sites never import a specific provider; they do:
 *
 *   await dispatcher.send({ orgId, channel: 'whatsapp', leadId, payload })
 *
 * Responsibilities:
 *   - Resolve the active `channel_integrations` row for (org, channel),
 *     respecting `is_default` when multiple providers exist.
 *   - Decrypt the config server-side.
 *   - Call the provider, record the outcome in `channel_messages`.
 *   - Flip `status → error` after N consecutive failures so the next send
 *     can fall through to a backup integration (if configured).
 *   - NEVER log decrypted config or raw message content at info level.
 */

const FAILURE_THRESHOLD_FOR_ERROR_STATE = 3

/** Registry of registered providers, keyed by `{channel}:{provider}`. */
const registry = new Map<string, ChannelProvider>()

export function registerProvider(provider: ChannelProvider): void {
  const key = `${provider.channel}:${provider.id}`
  registry.set(key, provider)
}

export function getProvider(channel: Channel, providerId: string): ChannelProvider | null {
  return registry.get(`${channel}:${providerId}`) ?? null
}

type ChannelIntegrationRow = {
  id: string
  organization_id: string
  channel: string
  provider: string
  display_name: string
  config: Record<string, unknown>
  status: 'active' | 'error' | 'disconnected'
  is_default: boolean
}

async function loadIntegration(orgId: string, channel: Channel, integrationId?: string): Promise<ResolvedIntegration | null> {
  const supabase = createServiceClient()
  let query = supabase
    .from('channel_integrations')
    .select(
      'id, organization_id, channel, provider, display_name, config, status, is_default'
    )
    .eq('organization_id', orgId)
    .eq('channel', channel)
    .eq('status', 'active')

  if (integrationId) {
    query = query.eq('id', integrationId)
  } else {
    // Prefer default; if no default, oldest active.
    query = query.order('is_default', { ascending: false }).order('created_at', { ascending: true })
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as ChannelIntegrationRow

  return {
    id: row.id,
    organizationId: row.organization_id,
    channel: row.channel as Channel,
    provider: row.provider,
    displayName: row.display_name,
    config: decryptConfig(row.config),
    status: row.status,
    isDefault: row.is_default,
  }
}

async function updateIntegrationHealth(integrationId: string, args: {
  success: boolean
  error?: string
}): Promise<void> {
  const supabase = createServiceClient()

  if (args.success) {
    await supabase
      .from('channel_integrations')
      .update({
        consecutive_failures: 0,
        last_error: null,
        last_error_at: null,
        status: 'active',
      })
      .eq('id', integrationId)
    return
  }

  // Fetch current counter to decide if we flip to `error`.
  const { data } = await supabase
    .from('channel_integrations')
    .select('consecutive_failures')
    .eq('id', integrationId)
    .single()

  const next = ((data?.consecutive_failures as number | undefined) ?? 0) + 1
  const shouldError = next >= FAILURE_THRESHOLD_FOR_ERROR_STATE

  await supabase
    .from('channel_integrations')
    .update({
      consecutive_failures: next,
      last_error: args.error ?? null,
      last_error_at: new Date().toISOString(),
      status: shouldError ? 'error' : 'active',
    })
    .eq('id', integrationId)
}

async function recordMessage(args: {
  integration: ResolvedIntegration
  leadId?: string | null
  campaignId?: string | null
  payload: SendPayload
  result: SendResult
}): Promise<string | null> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const baseRow = {
    organization_id: args.integration.organizationId,
    integration_id: args.integration.id,
    channel: args.integration.channel,
    lead_id: args.leadId ?? null,
    campaign_id: args.campaignId ?? null,
    direction: 'outbound' as const,
    subject: args.payload.subject ?? null,
    content: args.payload.content,
    metadata: args.payload.metadata ?? {},
  }

  if (args.result.ok) {
    const { data, error } = await supabase
      .from('channel_messages')
      .insert({
        ...baseRow,
        external_message_id: args.result.externalMessageId,
        thread_id: args.result.threadId ?? args.payload.threadId ?? null,
        status: args.result.status,
        sent_at: now,
        metadata: { ...baseRow.metadata, provider: args.result.providerMetadata ?? {} },
      })
      .select('id')
      .single()

    if (error) {
      // Idempotency collision — we tolerate this silently (same external id
      // means the provider already accepted the message).
      if ((error as { code?: string }).code === '23505') return null
      throw error
    }
    return (data?.id as string | undefined) ?? null
  }

  const { data, error } = await supabase
    .from('channel_messages')
    .insert({
      ...baseRow,
      status: 'failed',
      status_detail: args.result.error,
      failed_at: now,
    })
    .select('id')
    .single()

  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

export type DispatchInput = {
  orgId: string
  channel: Channel
  payload: SendPayload
  leadId?: string | null
  campaignId?: string | null
  /** Force a specific integration (admin preview, testing); otherwise default */
  integrationId?: string
}

export type DispatchOutcome = {
  ok: boolean
  messageId: string | null
  externalMessageId: string | null
  integrationId: string | null
  error?: string
  retryable?: boolean
}

export async function dispatch(input: DispatchInput): Promise<DispatchOutcome> {
  const integration = await loadIntegration(input.orgId, input.channel, input.integrationId)
  if (!integration) {
    return {
      ok: false,
      messageId: null,
      externalMessageId: null,
      integrationId: null,
      error: `No active integration for ${input.channel}`,
      retryable: false,
    }
  }

  const provider = getProvider(integration.channel, integration.provider)
  if (!provider) {
    return {
      ok: false,
      messageId: null,
      externalMessageId: null,
      integrationId: integration.id,
      error: `Provider "${integration.provider}" not registered for channel ${integration.channel}`,
      retryable: false,
    }
  }

  const result = await provider.send(integration, input.payload)

  const messageId = await recordMessage({
    integration,
    leadId: input.leadId,
    campaignId: input.campaignId,
    payload: input.payload,
    result,
  })

  await updateIntegrationHealth(integration.id, {
    success: result.ok,
    error: result.ok ? undefined : result.error,
  })

  if (!result.ok) {
    return {
      ok: false,
      messageId,
      externalMessageId: null,
      integrationId: integration.id,
      error: result.error,
      retryable: result.retryable,
    }
  }

  return {
    ok: true,
    messageId,
    externalMessageId: result.externalMessageId,
    integrationId: integration.id,
  }
}

/**
 * Handle an inbound webhook. The route at `/api/webhooks/channels/[provider]`
 * maps the URL segment to a provider id + channel via a small lookup, calls
 * `parseWebhook`, and then persists the canonical event.
 */
export async function handleWebhook(args: {
  channel: Channel
  providerId: string
  input: WebhookVerifyInput
}): Promise<{ processed: boolean; messageId: string | null; event: WebhookEvent | null }> {
  const provider = getProvider(args.channel, args.providerId)
  if (!provider?.parseWebhook) {
    return { processed: false, messageId: null, event: null }
  }

  // The caller may attach an integrationId for providers that include it in
  // the URL or headers. When absent we pass null and let the provider's
  // parser figure it out (e.g. from a signed payload).
  let integration: ResolvedIntegration | null = null
  if (args.input.integrationId) {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('channel_integrations')
      .select('id, organization_id, channel, provider, display_name, config, status, is_default')
      .eq('id', args.input.integrationId)
      .maybeSingle()
    if (data) {
      const row = data as ChannelIntegrationRow
      integration = {
        id: row.id,
        organizationId: row.organization_id,
        channel: row.channel as Channel,
        provider: row.provider,
        displayName: row.display_name,
        config: decryptConfig(row.config),
        status: row.status,
        isDefault: row.is_default,
      }
    }
  }

  const event = await provider.parseWebhook(integration, args.input)
  if (!event) return { processed: false, messageId: null, event: null }

  if (!integration && event.externalMessageId) {
    // Best-effort: find the message row by external id and infer the integration.
    const supabase = createServiceClient()
    const { data: msg } = await supabase
      .from('channel_messages')
      .select('id, integration_id, organization_id, lead_id')
      .eq('external_message_id', event.externalMessageId)
      .maybeSingle()
    if (msg) {
      return applyEventToMessage(msg.id as string, event)
    }
  }

  if (!integration) {
    return { processed: false, messageId: null, event }
  }

  // Outbound event: update an existing row by external id.
  if (event.externalMessageId && !event.inbound) {
    const supabase = createServiceClient()
    const { data: msg } = await supabase
      .from('channel_messages')
      .select('id')
      .eq('integration_id', integration.id)
      .eq('external_message_id', event.externalMessageId)
      .maybeSingle()
    if (msg) return applyEventToMessage(msg.id as string, event)
    return { processed: false, messageId: null, event }
  }

  // Inbound event: insert a new row + mark the related outbound as 'replied'.
  if (event.inbound) {
    const supabase = createServiceClient()
    const now = new Date().toISOString()

    // Try to link back to a lead via the thread/from.
    let leadId: string | null = null
    if (event.inbound.fromAddress) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', integration.organizationId)
        .or(
          `whatsapp.eq.${event.inbound.fromAddress},email.eq.${event.inbound.fromAddress}`
        )
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      leadId = (lead?.id as string | undefined) ?? null
    }

    const { data: inserted, error } = await supabase
      .from('channel_messages')
      .insert({
        organization_id: integration.organizationId,
        integration_id: integration.id,
        channel: integration.channel,
        lead_id: leadId,
        direction: 'inbound',
        external_message_id: event.externalMessageId,
        thread_id: event.inbound.threadId ?? null,
        content: event.inbound.content,
        status: 'delivered',
        metadata: { raw: event.raw ?? {} },
      })
      .select('id')
      .single()

    if (error && (error as { code?: string }).code !== '23505') throw error

    // Also mark the most recent outbound on this thread as 'replied'.
    if (event.inbound.threadId) {
      await supabase
        .from('channel_messages')
        .update({ status: 'replied', replied_at: now })
        .eq('integration_id', integration.id)
        .eq('thread_id', event.inbound.threadId)
        .eq('direction', 'outbound')
        .in('status', ['sent', 'delivered', 'read'])
    }

    return {
      processed: true,
      messageId: (inserted?.id as string | undefined) ?? null,
      event,
    }
  }

  return { processed: false, messageId: null, event }
}

async function applyEventToMessage(
  messageId: string,
  event: WebhookEvent
): Promise<{ processed: boolean; messageId: string; event: WebhookEvent }> {
  if (!event.canonicalStatus) {
    return { processed: false, messageId, event }
  }
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: event.canonicalStatus }
  if (event.canonicalStatus === 'delivered') patch.delivered_at = now
  if (event.canonicalStatus === 'read') patch.read_at = now
  if (event.canonicalStatus === 'replied') patch.replied_at = now
  if (event.canonicalStatus === 'bounced' || event.canonicalStatus === 'failed') patch.failed_at = now

  await supabase.from('channel_messages').update(patch).eq('id', messageId)
  return { processed: true, messageId, event }
}
