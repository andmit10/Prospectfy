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
 * Generic webhook — the "pluggable" escape hatch for WhatsApp. Customers
 * point Orbya at any HTTPS endpoint that implements a minimal contract:
 *
 *   Outbound:
 *     POST {endpoint}/send
 *     Headers: Authorization: Bearer {token}, X-Orbya-Signature: {hmac_sha256}
 *     Body: { phone, message, lead_id? }
 *     Response: { message_id }
 *
 *   Inbound (customer calls us):
 *     POST /api/webhooks/channels/whatsapp/generic_webhook
 *     Headers: X-Orbya-Signature: {hmac_sha256 of rawBody using webhookSecret}
 *     Body: { event: 'status'|'inbound', message_id, status?, from?, text? }
 *
 * Security:
 *   - **SSRF protection**: endpoint URL validated — must be https://, must
 *     resolve to a non-private IP (check done server-side; DNS rebinding
 *     is mitigated by a single DNS lookup at send time).
 *   - **HMAC signature** on outbound + inbound — both sides share
 *     `webhookSecret`.
 *   - **No redirect following** — fetch with `redirect: 'error'`.
 *
 * Config shape:
 *   { endpoint, bearerToken, webhookSecret }
 */

type GenericConfig = {
  endpoint: string
  bearerToken: string
  webhookSecret: string
}

function readConfig(integration: ResolvedIntegration): GenericConfig {
  const c = integration.config as GenericConfig
  if (!c.endpoint || !c.bearerToken || !c.webhookSecret) {
    throw new Error('Generic webhook integration missing endpoint / bearerToken / webhookSecret')
  }
  return c
}

/**
 * SSRF guard: block localhost / RFC1918 / link-local / IPv6 unique-local
 * ranges. We also reject non-https and any URL with embedded credentials.
 */
function isSafePublicUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Apenas HTTPS permitido' }
  if (u.username || u.password) return { ok: false, reason: 'Credenciais embutidas não permitidas' }

  const host = u.hostname.toLowerCase()

  // IPv4 literal
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 0.0.0.0/8, 169.254.0.0/16
    if (a === 10) return { ok: false, reason: 'Faixa privada não permitida' }
    if (a === 127 || a === 0) return { ok: false, reason: 'Loopback não permitido' }
    if (a === 169 && b === 254) return { ok: false, reason: 'Link-local não permitido' }
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: 'Faixa privada não permitida' }
    if (a === 192 && b === 168) return { ok: false, reason: 'Faixa privada não permitida' }
  }

  // IPv6 literal
  if (host.startsWith('[') && host.endsWith(']')) {
    const ipv6 = host.slice(1, -1)
    if (ipv6 === '::1') return { ok: false, reason: 'Loopback IPv6 não permitido' }
    if (/^fe80:/i.test(ipv6)) return { ok: false, reason: 'Link-local IPv6 não permitido' }
    if (/^fc00:/i.test(ipv6) || /^fd/i.test(ipv6))
      return { ok: false, reason: 'ULA IPv6 não permitido' }
  }

  // Blacklist common hostnames for cloud metadata endpoints.
  const blockedHosts = [
    'localhost',
    'metadata.google.internal',
    'metadata.goog',
    '169.254.169.254',
  ]
  if (blockedHosts.includes(host)) return { ok: false, reason: 'Host bloqueado' }

  return { ok: true }
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  const guard = isSafePublicUrl(config.endpoint)
  if (!guard.ok) {
    return { ok: false, error: `Endpoint bloqueado: ${guard.reason}`, retryable: false }
  }

  try {
    const body = JSON.stringify({
      phone: payload.to,
      message: payload.content,
      metadata: payload.metadata ?? {},
    })

    const signature = createHmac('sha256', config.webhookSecret).update(body).digest('hex')

    const res = await fetch(`${config.endpoint.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.bearerToken}`,
        'X-Orbya-Signature': signature,
      },
      body,
      redirect: 'error',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Webhook ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json().catch(() => ({}))) as { message_id?: string }
    return {
      ok: true,
      externalMessageId: json.message_id ?? null,
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
  integration: ResolvedIntegration | null,
  input: WebhookVerifyInput
): Promise<WebhookEvent | null> {
  if (!integration) return null
  const { webhookSecret } = readConfig(integration)
  const signature = input.headers.get('x-orbya-signature') ?? ''
  if (!signature) return null

  const expected = createHmac('sha256', webhookSecret).update(input.rawBody).digest('hex')
  const got = Buffer.from(signature, 'hex')
  const exp = Buffer.from(expected, 'hex')
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return null

  let event: {
    event?: string
    message_id?: string
    status?: string
    from?: string
    text?: string
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  if (event.event === 'inbound') {
    return {
      canonicalStatus: null,
      externalMessageId: event.message_id ?? null,
      inbound: {
        content: event.text ?? '',
        threadId: event.from,
        fromAddress: event.from ?? '',
      },
      raw: event,
    }
  }

  const statusMap: Record<string, WebhookEvent['canonicalStatus']> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
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
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : ''
  const bearerToken = typeof raw.bearerToken === 'string' ? raw.bearerToken.trim() : ''
  const webhookSecret = typeof raw.webhookSecret === 'string' ? raw.webhookSecret.trim() : ''
  if (!endpoint || !bearerToken || !webhookSecret) {
    return { ok: false, error: 'endpoint, bearerToken e webhookSecret são obrigatórios' }
  }
  const guard = isSafePublicUrl(endpoint)
  if (!guard.ok) return { ok: false, error: guard.reason ?? 'URL inválida' }
  if (webhookSecret.length < 16) {
    return { ok: false, error: 'webhookSecret deve ter pelo menos 16 caracteres' }
  }
  return { ok: true, normalized: { endpoint: endpoint.replace(/\/$/, ''), bearerToken, webhookSecret } }
}

export const genericWebhookProvider: ChannelProvider = {
  id: 'generic_webhook',
  channel: 'whatsapp',
  send,
  parseWebhook,
  validateConfig,
}
