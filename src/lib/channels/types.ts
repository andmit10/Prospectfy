/**
 * Shared types for the channel dispatcher. Every provider implements the
 * `ChannelProvider` interface; the dispatcher never knows about a specific
 * vendor.
 */

export type Channel = 'whatsapp' | 'email' | 'linkedin' | 'instagram' | 'sms'

export type Direction = 'outbound' | 'inbound'

export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'bounced'
  | 'failed'

/** A decrypted `channel_integrations` row ready to pass to a provider. */
export type ResolvedIntegration = {
  id: string
  organizationId: string
  channel: Channel
  provider: string
  displayName: string
  /** Decrypted config — contains real secrets. Never log this. */
  config: Record<string, unknown>
  status: 'active' | 'error' | 'disconnected'
  isDefault: boolean
}

export type SendPayload = {
  /** Recipient — phone, email, LinkedIn profile id, etc. — shape depends on channel */
  to: string
  /** Message body (sanitized). Email/LinkedIn may use HTML; others plain text. */
  content: string
  /** Email only — subject line */
  subject?: string
  /** Optional reply-to thread id (conversation continuation) */
  threadId?: string
  /** Additional provider-specific hints (headers, attachments, etc.) */
  metadata?: Record<string, unknown>
}

export type SendResult =
  | {
      ok: true
      externalMessageId: string | null
      threadId?: string
      status: MessageStatus
      providerMetadata?: Record<string, unknown>
    }
  | {
      ok: false
      error: string
      retryable: boolean
    }

export type WebhookEvent = {
  /** Maps a provider event to our canonical status. null = ignore. */
  canonicalStatus: MessageStatus | null
  /** Which message the event is about — provider's id. */
  externalMessageId: string | null
  /** If the event is an inbound reply, include the body + thread. */
  inbound?: {
    content: string
    threadId?: string
    fromAddress: string
  }
  /** Free-form provider payload for debugging. */
  raw?: Record<string, unknown>
}

export type WebhookVerifyInput = {
  integrationId?: string
  headers: Headers
  rawBody: string
}

export type ChannelProvider = {
  id: string
  channel: Channel
  /**
   * Send one message. Returns an external id for later webhook correlation.
   * Must NEVER throw — always returns `{ok:false}` for recoverable errors so
   * the dispatcher can decide retry/fallback.
   */
  send(integration: ResolvedIntegration, payload: SendPayload): Promise<SendResult>
  /**
   * Parse + verify an inbound webhook. Returns the canonical event the
   * dispatcher persists, or null when the body isn't valid / is replay-
   * protected.
   */
  parseWebhook?(
    integration: ResolvedIntegration | null,
    input: WebhookVerifyInput
  ): Promise<WebhookEvent | null>
  /**
   * Validate a config blob before it's encrypted + written. Returns a
   * normalized config (trimmed, canonical field names). Must reject obvious
   * problems (missing API key, malformed URL) before the write lands.
   */
  validateConfig(rawConfig: Record<string, unknown>): Promise<
    | { ok: true; normalized: Record<string, unknown> }
    | { ok: false; error: string }
  >
}
