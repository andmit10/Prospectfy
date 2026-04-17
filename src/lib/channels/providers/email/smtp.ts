import nodemailer from 'nodemailer'
import type {
  ChannelProvider,
  ResolvedIntegration,
  SendPayload,
  SendResult,
} from '../../types'

/**
 * SMTP — the "bring-your-own-server" escape hatch. Amazon SES, Mailgun,
 * customer's own postfix, anything that speaks SMTP.
 *
 * No webhook support — delivery status comes back out-of-band via the
 * SMTP server's bounce handler, not via webhooks. We can only record
 * `sent` when the SMTP handshake succeeds.
 *
 * Config shape:
 *   {
 *     host: string,
 *     port: number,         // usually 587 (STARTTLS) or 465 (TLS)
 *     secure: boolean,      // true for 465, false for 587
 *     username: string,
 *     password: string,
 *     fromAddress: string,
 *     fromName?: string
 *   }
 */

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromAddress: string
  fromName?: string
}

function readConfig(integration: ResolvedIntegration): SmtpConfig {
  const c = integration.config as Partial<SmtpConfig>
  if (!c.host || !c.port || !c.username || !c.password || !c.fromAddress) {
    throw new Error('SMTP integration missing host/port/username/password/fromAddress')
  }
  return {
    host: c.host,
    port: Number(c.port),
    secure: Boolean(c.secure),
    username: c.username,
    password: c.password,
    fromAddress: c.fromAddress,
    fromName: c.fromName,
  }
}

async function send(
  integration: ResolvedIntegration,
  payload: SendPayload
): Promise<SendResult> {
  const config = readConfig(integration)

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      // TLS: always require cert validation. Customers with self-signed certs
      // can set `rejectUnauthorized: false` via a future opt-in flag.
      tls: { rejectUnauthorized: true },
    })

    const info = await transporter.sendMail({
      from: config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress,
      to: payload.to,
      subject: payload.subject ?? '(sem assunto)',
      html: payload.content,
      ...(payload.threadId
        ? { inReplyTo: payload.threadId, references: payload.threadId }
        : {}),
    })

    return {
      ok: true,
      externalMessageId: info.messageId ?? null,
      threadId: info.messageId ?? payload.threadId,
      status: 'sent',
      providerMetadata: { response: info.response?.slice(0, 200) },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: msg,
      retryable: /\b(timeout|ECONNRESET|ECONNREFUSED|network|EAI_AGAIN)\b/i.test(msg),
    }
  }
}

async function validateConfig(
  raw: Record<string, unknown>
): Promise<{ ok: true; normalized: Record<string, unknown> } | { ok: false; error: string }> {
  const host = typeof raw.host === 'string' ? raw.host.trim() : ''
  const port = typeof raw.port === 'number' ? raw.port : Number(raw.port)
  const username = typeof raw.username === 'string' ? raw.username.trim() : ''
  const password = typeof raw.password === 'string' ? raw.password : ''
  const fromAddress = typeof raw.fromAddress === 'string' ? raw.fromAddress.trim() : ''
  if (!host || !port || !username || !password || !fromAddress) {
    return {
      ok: false,
      error: 'host, port, username, password e fromAddress são obrigatórios',
    }
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'port inválido' }
  }
  if (!fromAddress.includes('@')) return { ok: false, error: 'fromAddress inválido' }
  // Minimal SSRF-ish guard for SMTP — block localhost connects.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return { ok: false, error: 'SMTP para localhost não permitido' }
  }
  const secure =
    typeof raw.secure === 'boolean' ? raw.secure : Number(port) === 465
  const fromName =
    typeof raw.fromName === 'string' && raw.fromName.trim() ? raw.fromName.trim() : undefined

  return {
    ok: true,
    normalized: {
      host,
      port: Number(port),
      secure,
      username,
      password,
      fromAddress,
      fromName,
    },
  }
}

export const smtpProvider: ChannelProvider = {
  id: 'smtp',
  channel: 'email',
  send,
  // No webhook — SMTP delivery state isn't pushed to us.
  validateConfig,
}
