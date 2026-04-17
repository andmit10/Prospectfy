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
 * Instagram — Meta Business Graph API. Requires: (a) Instagram Business or
 * Creator account, (b) connected to a Facebook Page, (c) Meta App reviewed
 * for `instagram_business_messaging` (4-8 weeks). Disabled in the UI until
 * the customer supplies a verified access token.
 *
 * Config shape:
 *   {
 *     pageAccessToken: string,     // long-lived page token
 *     igBusinessAccountId: string, // Instagram Business Account id
 *     appSecret: string            // for webhook HMAC verification
 *   }
 *
 * To send an IG DM: POST /{ig-user-id}/messages
 */

type MetaIgConfig = {
  pageAccessToken: string
  igBusinessAccountId: string
  appSecret: string
}

function readConfig(integration: ResolvedIntegration): MetaIgConfig {
  const c = integration.config as MetaIgConfig
  if (!c.pageAccessToken || !c.igBusinessAccountId || !c.appSecret) {
    throw new Error(
      'Instagram integration missing pageAccessToken / igBusinessAccountId / appSecret'
    )
  }
  return c
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(config.igBusinessAccountId)}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: payload.to }, // IG-scoped user id
        message: { text: payload.content },
        messaging_type: 'RESPONSE',
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Meta IG ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as { message_id?: string; recipient_id?: string }
    return {
      ok: true,
      externalMessageId: json.message_id ?? null,
      threadId: json.recipient_id ?? payload.to,
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
  const { appSecret } = readConfig(integration)

  // Meta signs webhooks with `x-hub-signature-256: sha256=<hex>`.
  const header = input.headers.get('x-hub-signature-256') ?? ''
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(input.rawBody).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let body: {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string }
        recipient?: { id?: string }
        message?: { mid?: string; text?: string; is_echo?: boolean }
        read?: { mid?: string }
        delivery?: { mids?: string[] }
      }>
    }>
  }
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const msg = body.entry?.[0]?.messaging?.[0]
  if (!msg) return null

  if (msg.read?.mid) {
    return { canonicalStatus: 'read', externalMessageId: msg.read.mid, raw: body as unknown as Record<string, unknown> }
  }
  if (msg.delivery?.mids?.[0]) {
    return {
      canonicalStatus: 'delivered',
      externalMessageId: msg.delivery.mids[0],
      raw: body as unknown as Record<string, unknown>,
    }
  }
  if (msg.message?.text && !msg.message.is_echo) {
    return {
      canonicalStatus: null,
      externalMessageId: msg.message.mid ?? null,
      inbound: {
        content: msg.message.text,
        threadId: msg.sender?.id,
        fromAddress: msg.sender?.id ?? '',
      },
      raw: body as unknown as Record<string, unknown>,
    }
  }

  return null
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const pageAccessToken =
    typeof raw.pageAccessToken === 'string' ? raw.pageAccessToken.trim() : ''
  const igBusinessAccountId =
    typeof raw.igBusinessAccountId === 'string' ? raw.igBusinessAccountId.trim() : ''
  const appSecret = typeof raw.appSecret === 'string' ? raw.appSecret.trim() : ''
  if (!pageAccessToken || !igBusinessAccountId || !appSecret) {
    return {
      ok: false,
      error: 'pageAccessToken, igBusinessAccountId e appSecret são obrigatórios',
    }
  }
  if (!/^\d+$/.test(igBusinessAccountId)) {
    return { ok: false, error: 'igBusinessAccountId deve ser numérico' }
  }
  return { ok: true, normalized: { pageAccessToken, igBusinessAccountId, appSecret } }
}

export const metaInstagramProvider: ChannelProvider = {
  id: 'meta_instagram',
  channel: 'instagram',
  send,
  parseWebhook,
  validateConfig,
}
