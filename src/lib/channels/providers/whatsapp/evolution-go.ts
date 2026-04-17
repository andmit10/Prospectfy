import { Agent } from 'undici'
import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * Evolution GO — Go-based rewrite of the Evolution API by EvoAI / Evolution
 * Foundation. Same WhatsApp Web (Baileys) underlying tech, but a different
 * HTTP surface than the original TypeScript Evolution API:
 *   - Send endpoint:  POST /send/text  (body: { number, text })
 *   - List instances: GET  /instance/all
 *   - Webhook config: POST /instance/connect (with webhookUrl + subscribe)
 *   - Webhook payload shape: { event, data, instanceId }
 *
 * Auth: `apikey` header. The endpoints accept either:
 *   - the GLOBAL_API_KEY (env var on the Evolution server) — admin-wide, OR
 *   - the per-instance token (UUID generated when the instance is created).
 * For sending we prefer the instance token so a leaked integration row only
 * compromises one number.
 *
 * TLS: many self-hosted Evolution Go installs run behind a self-signed
 * cert at a raw IP. The `ignoreTls` config flag opts into a Node undici
 * dispatcher that skips cert validation for THIS provider only — never set
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` globally.
 */

type EvolutionGoConfig = {
  baseUrl: string
  /** Per-instance token (UUID) — preferred for /send/* endpoints. */
  instanceToken: string
  /** Instance name (display only on this server). */
  instanceName: string
  /** Instance UUID — used for /instance/* endpoints (header instanceId). */
  instanceId?: string
  /** Optional GLOBAL_API_KEY for endpoints that need admin scope (instance/connect, etc.). */
  globalApiKey?: string
  /** Skip TLS verification — for self-signed certs / raw-IP HTTPS. */
  ignoreTls?: boolean
}

function readConfig(integration: ResolvedIntegration): EvolutionGoConfig {
  const c = integration.config as EvolutionGoConfig
  if (!c.baseUrl || !c.instanceToken || !c.instanceName) {
    throw new Error('Evolution Go integration missing baseUrl / instanceToken / instanceName')
  }
  return {
    baseUrl: c.baseUrl.replace(/\/$/, ''),
    instanceToken: c.instanceToken,
    instanceName: c.instanceName,
    instanceId: c.instanceId,
    globalApiKey: c.globalApiKey,
    ignoreTls: c.ignoreTls ?? false,
  }
}

// Cache one undici Agent per (origin, ignoreTls) so we don't churn TCP pools.
const dispatcherCache = new Map<string, Agent>()

function dispatcherFor(baseUrl: string, ignoreTls: boolean): Agent | undefined {
  if (!ignoreTls) return undefined
  const origin = new URL(baseUrl).origin
  const key = `${origin}|skip-tls`
  let agent = dispatcherCache.get(key)
  if (!agent) {
    agent = new Agent({ connect: { rejectUnauthorized: false } })
    dispatcherCache.set(key, agent)
  }
  return agent
}

type FetchInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent }

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const init: FetchInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.instanceToken,
      },
      body: JSON.stringify({
        number: payload.to,
        text: payload.content,
      }),
    }
    const dispatcher = dispatcherFor(config.baseUrl, config.ignoreTls ?? false)
    if (dispatcher) init.dispatcher = dispatcher

    const res = await fetch(`${config.baseUrl}/send/text`, init)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Evolution Go ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as {
      data?: {
        Info?: {
          ID?: string
          Chat?: string
          Sender?: string
          Timestamp?: string
        }
      }
      message?: string
    }

    const info = json.data?.Info
    return {
      ok: true,
      externalMessageId: info?.ID ?? null,
      threadId: info?.Chat ?? `${payload.to}@s.whatsapp.net`,
      status: 'sent',
      providerMetadata: { evo_go_status: json.message, sender: info?.Sender },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const tlsHint = /self.signed|UNABLE_TO_VERIFY|CERT_HAS_EXPIRED|altnames/i.test(msg)
      ? ' — set ignoreTls: true on the integration if the server uses a self-signed cert'
      : ''
    return {
      ok: false,
      error: msg + tlsHint,
      retryable: /\b(timeout|ECONNRESET|ECONNREFUSED|network|fetch failed)\b/i.test(msg),
    }
  }
}

/**
 * Webhook payload shape (per docs/evolution-go/webhooks):
 *   { event: "Message"|"SendMessage"|"Receipt"|"Connected"|..., data: {...}, instanceId: "..." }
 *
 * Event mapping → canonical status:
 *   Message            → null (inbound — reply path)
 *   SendMessage        → 'sent'        (our own send was acked)
 *   Receipt + Delivered→ 'delivered'
 *   Receipt + Read     → 'read'
 *   anything else      → null (ignored)
 *
 * Evolution Go does NOT sign webhooks. Operators should keep the URL secret
 * and we additionally accept an optional `webhookSecret` config field that
 * must arrive as `?secret=...` in the inbound URL (verified by the route).
 */
async function parseWebhook(
  _integration: ResolvedIntegration | null,
  input: WebhookVerifyInput
): Promise<WebhookEvent | null> {
  let body: {
    event?: string
    instanceId?: string
    data?: {
      Info?: {
        ID?: string
        Chat?: string
        Sender?: string
        PushName?: string
        IsFromMe?: boolean
        Timestamp?: string
        Type?: string
      }
      Message?: {
        conversation?: string
        extendedTextMessage?: { text?: string }
      }
      type?: string
      receiptType?: string
      Type?: string
    }
  }
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const event = body.event ?? ''
  const data = body.data ?? {}
  const info = data.Info ?? {}
  const messageId = info.ID ?? null

  // Inbound message from a lead → not from us
  if (event === 'Message' && info.IsFromMe === false) {
    const text =
      data.Message?.conversation ??
      data.Message?.extendedTextMessage?.text ??
      ''
    if (!text) return null
    const senderJid = info.Sender ?? info.Chat ?? ''
    return {
      canonicalStatus: null,
      externalMessageId: messageId,
      inbound: {
        content: text,
        threadId: info.Chat ?? senderJid,
        fromAddress: senderJid.replace(/@s\.whatsapp\.net$/, '').replace(/:\d+$/, ''),
      },
      raw: body as unknown as Record<string, unknown>,
    }
  }

  // Our own send was acked
  if (event === 'SendMessage') {
    return {
      canonicalStatus: 'sent',
      externalMessageId: messageId,
      raw: body as unknown as Record<string, unknown>,
    }
  }

  // Read/delivered receipts
  if (event === 'Receipt') {
    const receiptType = (data.receiptType ?? data.type ?? data.Type ?? '').toLowerCase()
    const map: Record<string, WebhookEvent['canonicalStatus']> = {
      delivered: 'delivered',
      read: 'read',
      readself: 'read',
    }
    return {
      canonicalStatus: map[receiptType] ?? null,
      externalMessageId: messageId,
      raw: body as unknown as Record<string, unknown>,
    }
  }

  // Connection lifecycle, QR, etc. — log only
  return {
    canonicalStatus: null,
    externalMessageId: messageId,
    raw: body as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : ''
  const instanceToken = typeof raw.instanceToken === 'string' ? raw.instanceToken.trim() : ''
  const instanceName = typeof raw.instanceName === 'string' ? raw.instanceName.trim() : ''
  if (!baseUrl || !instanceToken || !instanceName) {
    return { ok: false, error: 'baseUrl, instanceToken e instanceName são obrigatórios' }
  }
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return { ok: false, error: 'baseUrl inválida' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'baseUrl deve usar http(s)' }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(instanceName)) {
    return { ok: false, error: 'instanceName deve conter apenas letras, números, _ ou -' }
  }
  // UUID-ish check for instanceToken (Evolution Go generates UUIDs)
  if (instanceToken.length < 16) {
    return { ok: false, error: 'instanceToken parece curto demais — verifique o token da instância' }
  }
  return {
    ok: true,
    normalized: {
      baseUrl: baseUrl.replace(/\/$/, ''),
      instanceToken,
      instanceName,
      instanceId: typeof raw.instanceId === 'string' ? raw.instanceId.trim() : undefined,
      globalApiKey: typeof raw.globalApiKey === 'string' ? raw.globalApiKey.trim() : undefined,
      ignoreTls: raw.ignoreTls === true || raw.ignoreTls === 'true',
    },
  }
}

export const evolutionGoProvider: ChannelProvider = {
  id: 'evolution_go',
  channel: 'whatsapp',
  send,
  parseWebhook,
  validateConfig,
}
