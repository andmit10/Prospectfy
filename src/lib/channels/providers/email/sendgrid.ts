import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * SendGrid — enterprise email provider. Config + basic send only (webhook
 * event verification uses ECDSA which we'll add in Phase 6 when the admin
 * UI catches up to the full provider story).
 *
 * Config shape:
 *   { apiKey: string, fromAddress: string, fromName?: string }
 */

type SendGridConfig = {
  apiKey: string
  fromAddress: string
  fromName?: string
}

function readConfig(integration: ResolvedIntegration): SendGridConfig {
  const c = integration.config as SendGridConfig
  if (!c.apiKey || !c.fromAddress) {
    throw new Error('SendGrid integration missing apiKey / fromAddress')
  }
  return c
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: payload.to }],
            subject: payload.subject ?? '(sem assunto)',
          },
        ],
        from: { email: config.fromAddress, name: config.fromName },
        content: [{ type: 'text/html', value: payload.content }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `SendGrid ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    // SendGrid returns the message id in the `x-message-id` header.
    return {
      ok: true,
      externalMessageId: res.headers.get('x-message-id'),
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
  let events: Array<{
    sg_message_id?: string
    event?: string
    email?: string
  }>
  try {
    events = JSON.parse(input.rawBody)
  } catch {
    return null
  }
  if (!Array.isArray(events) || events.length === 0) return null

  const first = events[0]
  const typeMap: Record<string, WebhookEvent['canonicalStatus']> = {
    processed: 'sent',
    delivered: 'delivered',
    open: 'read',
    click: 'read',
    bounce: 'bounced',
    dropped: 'bounced',
    spamreport: 'bounced',
  }

  return {
    canonicalStatus: typeMap[first.event ?? ''] ?? null,
    externalMessageId: (first.sg_message_id ?? '').split('.')[0] || null,
    raw: first as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const fromAddress = typeof raw.fromAddress === 'string' ? raw.fromAddress.trim() : ''
  if (!apiKey) return { ok: false, error: 'apiKey é obrigatória' }
  if (!apiKey.startsWith('SG.')) return { ok: false, error: 'apiKey SendGrid deve começar com SG.' }
  if (!fromAddress || !fromAddress.includes('@')) {
    return { ok: false, error: 'fromAddress inválido' }
  }
  const fromName =
    typeof raw.fromName === 'string' && raw.fromName.trim() ? raw.fromName.trim() : undefined
  return { ok: true, normalized: { apiKey, fromAddress, fromName } }
}

export const sendgridProvider: ChannelProvider = {
  id: 'sendgrid',
  channel: 'email',
  send,
  parseWebhook,
  validateConfig,
}
