import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Directfy — Orbya's first-party WhatsApp provider. Refactored from the
 * standalone `src/server/services/directfy.ts` into the pluggable shape.
 *
 * Config shape:
 *   { apiKey: string, apiUrl?: string, webhookSecret?: string }
 */

type DirectfyConfig = {
  apiKey: string
  apiUrl?: string
  webhookSecret?: string
}

function readConfig(integration: ResolvedIntegration): DirectfyConfig {
  const c = integration.config as DirectfyConfig
  if (!c.apiKey) throw new Error('Directfy integration missing apiKey')
  return {
    apiKey: c.apiKey,
    apiUrl: c.apiUrl ?? 'https://api.directfy.com',
    webhookSecret: c.webhookSecret,
  }
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const res = await fetch(`${config.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        phone: payload.to,
        message: payload.content,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Directfy ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as {
      message_id?: string
      id?: string
      status?: string
    }

    return {
      ok: true,
      externalMessageId: json.message_id ?? json.id ?? null,
      threadId: payload.to,
      status: 'sent',
      providerMetadata: { directfy_status: json.status },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: msg,
      retryable: /\b(timeout|ECONNRESET|ECONNREFUSED|network)\b/i.test(msg),
    }
  }
}

async function parseWebhook(
  integration: ResolvedIntegration | null,
  input: WebhookVerifyInput
): Promise<WebhookEvent | null> {
  // HMAC verification — Directfy signs the raw body with the integration
  // `webhookSecret` via `x-directfy-signature` (sha256 hex).
  const signature = input.headers.get('x-directfy-signature') ?? ''
  if (integration) {
    const { webhookSecret } = readConfig(integration)
    if (webhookSecret && signature) {
      const expected = createHmac('sha256', webhookSecret).update(input.rawBody).digest('hex')
      const got = Buffer.from(signature, 'hex')
      const exp = Buffer.from(expected, 'hex')
      if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
        return null
      }
    }
  }

  let event: {
    event?: string
    message_id?: string
    status?: string
    from?: string
    text?: string
    timestamp?: string
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const statusMap: Record<string, WebhookEvent['canonicalStatus']> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    bounced: 'bounced',
  }

  if (event.event === 'message.inbound' || (event.from && event.text)) {
    return {
      canonicalStatus: null,
      externalMessageId: event.message_id ?? null,
      inbound: {
        content: event.text ?? '',
        threadId: event.from ?? undefined,
        fromAddress: event.from ?? '',
      },
      raw: event,
    }
  }

  return {
    canonicalStatus: statusMap[event.status ?? ''] ?? null,
    externalMessageId: event.message_id ?? null,
    raw: event,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  if (!apiKey) return { ok: false, error: 'apiKey é obrigatório' }
  const apiUrl = typeof raw.apiUrl === 'string' && raw.apiUrl.trim()
    ? raw.apiUrl.trim().replace(/\/$/, '')
    : 'https://api.directfy.com'
  try {
    const u = new URL(apiUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return { ok: false, error: 'apiUrl deve usar http(s)' }
    }
  } catch {
    return { ok: false, error: 'apiUrl inválida' }
  }
  const webhookSecret =
    typeof raw.webhookSecret === 'string' && raw.webhookSecret.trim()
      ? raw.webhookSecret.trim()
      : undefined
  return { ok: true, normalized: { apiKey, apiUrl, webhookSecret } }
}

export const directfyProvider: ChannelProvider = {
  id: 'directfy',
  channel: 'whatsapp',
  send,
  parseWebhook,
  validateConfig,
}
