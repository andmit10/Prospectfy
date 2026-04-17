import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * Evolution API (Baileys wrapper) — self-hosted WhatsApp gateway. Customers
 * run their own Evolution instance and point Orbya at it via baseUrl + API
 * key. Popular in the BR market for its zero per-message cost and full
 * feature parity with WhatsApp Web.
 *
 * Caveat: Evolution uses the UN-official WhatsApp API; sessions can be
 * banned by Meta. We surface this risk in the UI (in Phase 3f) but don't
 * block the integration.
 *
 * Config shape:
 *   {
 *     baseUrl: string,     // e.g. https://evo.my-company.com
 *     apiKey: string,      // global key set on the Evolution server
 *     instanceName: string // instance identifier (per phone number)
 *   }
 */

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instanceName: string
}

function readConfig(integration: ResolvedIntegration): EvolutionConfig {
  const c = integration.config as EvolutionConfig
  if (!c.baseUrl || !c.apiKey || !c.instanceName) {
    throw new Error('Evolution integration missing baseUrl / apiKey / instanceName')
  }
  return {
    baseUrl: c.baseUrl.replace(/\/$/, ''),
    apiKey: c.apiKey,
    instanceName: c.instanceName,
  }
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    // Evolution's typical send endpoint: POST /message/sendText/{instance}
    const res = await fetch(
      `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({
          number: payload.to,
          text: payload.content,
        }),
      }
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Evolution ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as {
      key?: { id?: string; remoteJid?: string }
      status?: string
    }

    return {
      ok: true,
      externalMessageId: json.key?.id ?? null,
      threadId: json.key?.remoteJid ?? payload.to,
      status: 'sent',
      providerMetadata: { evolution_status: json.status },
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
  // Evolution doesn't sign webhooks by default — operators SHOULD configure
  // their Evolution server with an `api_key` header check + a VPN allowlist.
  // We parse the payload shape either way.
  let event: {
    event?: string
    data?: {
      key?: { id?: string; remoteJid?: string; fromMe?: boolean }
      message?: { conversation?: string; extendedTextMessage?: { text?: string } }
      status?: string
    }
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const key = event.data?.key
  const messageId = key?.id ?? null
  const fromMe = key?.fromMe ?? false
  const status = event.data?.status

  const statusMap: Record<string, WebhookEvent['canonicalStatus']> = {
    SENT: 'sent',
    DELIVERY_ACK: 'delivered',
    READ: 'read',
    ERROR: 'failed',
  }

  // Inbound message from lead
  if (!fromMe && event.event === 'messages.upsert') {
    const text =
      event.data?.message?.conversation ?? event.data?.message?.extendedTextMessage?.text ?? ''
    return {
      canonicalStatus: null,
      externalMessageId: messageId,
      inbound: {
        content: text,
        threadId: key?.remoteJid ?? undefined,
        fromAddress: (key?.remoteJid ?? '').replace('@s.whatsapp.net', ''),
      },
      raw: event as unknown as Record<string, unknown>,
    }
  }

  return {
    canonicalStatus: statusMap[status ?? ''] ?? null,
    externalMessageId: messageId,
    raw: event as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : ''
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const instanceName = typeof raw.instanceName === 'string' ? raw.instanceName.trim() : ''
  if (!baseUrl || !apiKey || !instanceName) {
    return { ok: false, error: 'baseUrl, apiKey e instanceName são obrigatórios' }
  }
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return { ok: false, error: 'baseUrl deve usar http(s)' }
    }
  } catch {
    return { ok: false, error: 'baseUrl inválida' }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(instanceName)) {
    return { ok: false, error: 'instanceName deve conter apenas letras, números, _ ou -' }
  }
  return { ok: true, normalized: { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, instanceName } }
}

export const evolutionProvider: ChannelProvider = {
  id: 'evolution',
  channel: 'whatsapp',
  send,
  parseWebhook,
  validateConfig,
}
