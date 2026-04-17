import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * Resend — first-choice email provider. API-first, great deliverability,
 * React Email native. Webhook uses Svix signatures (base64 + HMAC SHA-256).
 *
 * Config shape:
 *   {
 *     apiKey: string,           // re_xxx (Resend API key)
 *     fromAddress: string,      // verified sender e.g. "Orbya <sales@orbya.io>"
 *     webhookSigningSecret?: string  // from Resend dashboard, starts with whsec_
 *   }
 */

type ResendConfig = {
  apiKey: string
  fromAddress: string
  webhookSigningSecret?: string
}

function readConfig(integration: ResolvedIntegration): ResendConfig {
  const c = integration.config as ResendConfig
  if (!c.apiKey || !c.fromAddress) {
    throw new Error('Resend integration missing apiKey / fromAddress')
  }
  return c
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: config.fromAddress,
        to: [payload.to],
        subject: payload.subject ?? '(sem assunto)',
        html: payload.content,
        headers: payload.threadId
          ? { 'In-Reply-To': payload.threadId, References: payload.threadId }
          : undefined,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Resend ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as { id?: string }
    return {
      ok: true,
      externalMessageId: json.id ?? null,
      threadId: json.id ?? payload.threadId,
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
  // NOTE: Resend uses Svix-style signature verification. For now we parse
  // the payload and accept if the `webhookSigningSecret` isn't set — Phase 6
  // will add strict Svix verification (it requires computing HMAC over
  // msg_id + msg_timestamp + body with a specific format).
  let event: {
    type?: string
    data?: {
      email_id?: string
      to?: string[]
      subject?: string
    }
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const typeMap: Record<string, WebhookEvent['canonicalStatus']> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.opened': 'read',
    'email.clicked': 'read',
    'email.bounced': 'bounced',
    'email.complained': 'bounced',
    'email.delivery_delayed': null as unknown as WebhookEvent['canonicalStatus'],
  }

  return {
    canonicalStatus: typeMap[event.type ?? ''] ?? null,
    externalMessageId: event.data?.email_id ?? null,
    raw: event as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const fromAddress = typeof raw.fromAddress === 'string' ? raw.fromAddress.trim() : ''
  if (!apiKey) return { ok: false, error: 'apiKey é obrigatória' }
  if (!apiKey.startsWith('re_')) return { ok: false, error: 'apiKey Resend deve começar com re_' }
  if (!fromAddress) return { ok: false, error: 'fromAddress é obrigatório' }
  if (!fromAddress.includes('@')) return { ok: false, error: 'fromAddress inválido' }
  const webhookSigningSecret =
    typeof raw.webhookSigningSecret === 'string' && raw.webhookSigningSecret.trim()
      ? raw.webhookSigningSecret.trim()
      : undefined
  return { ok: true, normalized: { apiKey, fromAddress, webhookSigningSecret } }
}

export const resendProvider: ChannelProvider = {
  id: 'resend',
  channel: 'email',
  send,
  parseWebhook,
  validateConfig,
}
