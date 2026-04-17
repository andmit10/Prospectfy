import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * Z-API — commercial Brazilian WhatsApp gateway. Lower friction than
 * Evolution self-hosting but still non-official (same ToS risk). Popular
 * option for SMBs who want a managed service.
 *
 * Config shape:
 *   {
 *     instanceId: string,  // Z-API instance id
 *     instanceToken: string // instance-level token
 *     clientToken?: string  // optional account-level header
 *   }
 */

type ZapiConfig = {
  instanceId: string
  instanceToken: string
  clientToken?: string
}

function readConfig(integration: ResolvedIntegration): ZapiConfig {
  const c = integration.config as ZapiConfig
  if (!c.instanceId || !c.instanceToken) {
    throw new Error('Z-API integration missing instanceId / instanceToken')
  }
  return {
    instanceId: c.instanceId,
    instanceToken: c.instanceToken,
    clientToken: c.clientToken,
  }
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const url = `https://api.z-api.io/instances/${encodeURIComponent(config.instanceId)}/token/${encodeURIComponent(config.instanceToken)}/send-text`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config.clientToken) headers['Client-Token'] = config.clientToken

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: payload.to,
        message: payload.content,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Z-API ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as {
      messageId?: string
      id?: string
      zaapId?: string
    }

    return {
      ok: true,
      externalMessageId: json.messageId ?? json.id ?? json.zaapId ?? null,
      threadId: payload.to,
      status: 'sent',
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
  _integration: ResolvedIntegration | null,
  input: WebhookVerifyInput
): Promise<WebhookEvent | null> {
  let event: {
    type?: string
    messageId?: string
    phone?: string
    text?: { message?: string }
    status?: string
    fromMe?: boolean
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const statusMap: Record<string, WebhookEvent['canonicalStatus']> = {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    'MESSAGE-STATUS-DELIVERED': 'delivered',
    'MESSAGE-STATUS-READ': 'read',
  }

  // Inbound message
  if (!event.fromMe && event.text?.message) {
    return {
      canonicalStatus: null,
      externalMessageId: event.messageId ?? null,
      inbound: {
        content: event.text.message,
        threadId: event.phone,
        fromAddress: event.phone ?? '',
      },
      raw: event as unknown as Record<string, unknown>,
    }
  }

  return {
    canonicalStatus: statusMap[event.type ?? event.status ?? ''] ?? null,
    externalMessageId: event.messageId ?? null,
    raw: event as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const instanceId = typeof raw.instanceId === 'string' ? raw.instanceId.trim() : ''
  const instanceToken = typeof raw.instanceToken === 'string' ? raw.instanceToken.trim() : ''
  if (!instanceId || !instanceToken) {
    return { ok: false, error: 'instanceId e instanceToken são obrigatórios' }
  }
  const clientToken =
    typeof raw.clientToken === 'string' && raw.clientToken.trim()
      ? raw.clientToken.trim()
      : undefined
  return { ok: true, normalized: { instanceId, instanceToken, clientToken } }
}

export const zapiProvider: ChannelProvider = {
  id: 'zapi',
  channel: 'whatsapp',
  send,
  parseWebhook,
  validateConfig,
}
