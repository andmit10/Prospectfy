import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
  WebhookEvent,
  WebhookVerifyInput,
} from '../../types'

/**
 * Unipile — managed third-party for LinkedIn automation. Customer connects
 * their LinkedIn account once via Unipile's hosted OAuth flow; Unipile
 * returns an `account_id` we store here. From then on we call Unipile's
 * REST API to send DMs / invites / visit profiles.
 *
 * Disclaimer surfaced in UI (Phase 3f): LinkedIn ToS forbids automation.
 * Unipile is the lowest-risk option but the session can still be banned.
 *
 * Config shape:
 *   {
 *     dsn: string,        // Unipile data source name e.g. "api8.unipile.com:14xxx"
 *     apiKey: string,     // Unipile API key (X-API-KEY header)
 *     accountId: string,  // the LinkedIn account the user connected
 *   }
 */

type UnipileConfig = {
  dsn: string
  apiKey: string
  accountId: string
}

function readConfig(integration: ResolvedIntegration): UnipileConfig {
  const c = integration.config as UnipileConfig
  if (!c.dsn || !c.apiKey || !c.accountId) {
    throw new Error('Unipile integration missing dsn / apiKey / accountId')
  }
  return c
}

function buildBaseUrl(dsn: string): string {
  // Unipile returns DSNs in the form `apiX.unipile.com:NNNNN` — expand to https.
  const cleaned = dsn.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${cleaned}/api/v1`
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)
  const baseUrl = buildBaseUrl(config.dsn)

  try {
    // `payload.to` is the Unipile chat_id of an existing conversation OR
    // a LinkedIn provider_id (profile identifier). Unipile routes both
    // through the same endpoint.
    const res = await fetch(`${baseUrl}/chats/${encodeURIComponent(payload.to)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': config.apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify({
        account_id: config.accountId,
        text: payload.content,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Unipile ${res.status}: ${text.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      }
    }

    const json = (await res.json()) as {
      id?: string
      message_id?: string
      chat_id?: string
    }

    return {
      ok: true,
      externalMessageId: json.message_id ?? json.id ?? null,
      threadId: json.chat_id ?? payload.to,
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
    event?: string
    message_id?: string
    chat_id?: string
    sender?: { provider_id?: string }
    text?: string
  }
  try {
    event = JSON.parse(input.rawBody)
  } catch {
    return null
  }

  const isInbound = event.event === 'messaging_new_message'
  if (isInbound) {
    return {
      canonicalStatus: null,
      externalMessageId: event.message_id ?? null,
      inbound: {
        content: event.text ?? '',
        threadId: event.chat_id,
        fromAddress: event.sender?.provider_id ?? '',
      },
      raw: event as unknown as Record<string, unknown>,
    }
  }

  return {
    canonicalStatus: event.event === 'message_delivered' ? 'delivered' : null,
    externalMessageId: event.message_id ?? null,
    raw: event as unknown as Record<string, unknown>,
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const dsn = typeof raw.dsn === 'string' ? raw.dsn.trim() : ''
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const accountId = typeof raw.accountId === 'string' ? raw.accountId.trim() : ''
  if (!dsn || !apiKey || !accountId) {
    return { ok: false, error: 'dsn, apiKey e accountId são obrigatórios' }
  }
  if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(dsn)) {
    return { ok: false, error: 'dsn inválido — formato esperado: apiX.unipile.com:NNNNN' }
  }
  return { ok: true, normalized: { dsn, apiKey, accountId } }
}

export const unipileProvider: ChannelProvider = {
  id: 'unipile',
  channel: 'linkedin',
  send,
  parseWebhook,
  validateConfig,
}
