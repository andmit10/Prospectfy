import { createServiceClient } from '@/lib/supabase/service'
import { randomShortCode } from './bot-detector'

/**
 * Tracking link lifecycle:
 *   1. `createTrackingLink` — tRPC / tools / send_message template resolver
 *   2. `/r/[code]` — redirect route logs event, applies rules, 302s target
 *   3. `resolveMessageTemplate` — replaces `{link:URL}` in outbound messages
 *
 * Security:
 *   - `target_url` validated for SSRF using the same guard as generic-webhook.
 *   - `short_code` is unguessable (~8e17 entropy).
 *   - Creation requires writer role (enforced at router level).
 */

const MAX_URL_LENGTH = 2048

/** Same public-URL guard as the generic-webhook channel provider. */
function isSafePublicUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'URL inválida' }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'Apenas http(s) permitido' }
  }
  if (u.username || u.password) return { ok: false, reason: 'Credenciais embutidas não permitidas' }

  const host = u.hostname.toLowerCase()
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    if (a === 10 || a === 127 || a === 0) return { ok: false, reason: 'IP privado' }
    if (a === 169 && b === 254) return { ok: false, reason: 'Link-local' }
    if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: 'IP privado' }
    if (a === 192 && b === 168) return { ok: false, reason: 'IP privado' }
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const ipv6 = host.slice(1, -1)
    if (ipv6 === '::1' || /^fe80:/i.test(ipv6) || /^fc00:/i.test(ipv6) || /^fd/i.test(ipv6)) {
      return { ok: false, reason: 'IPv6 privado' }
    }
  }
  if (['localhost', '169.254.169.254', 'metadata.google.internal'].includes(host)) {
    return { ok: false, reason: 'Host bloqueado' }
  }

  return { ok: true }
}

export type CreateTrackingLinkInput = {
  organizationId: string
  targetUrl: string
  leadId?: string | null
  campaignId?: string | null
  agentRunId?: string | null
  label?: string | null
  expiresAt?: string | null
  createdBy?: string | null
}

export async function createTrackingLink(input: CreateTrackingLinkInput): Promise<{
  id: string
  shortCode: string
  publicUrl: string
}> {
  if (input.targetUrl.length > MAX_URL_LENGTH) {
    throw new Error('URL muito longa')
  }
  const guard = isSafePublicUrl(input.targetUrl)
  if (!guard.ok) {
    throw new Error(`URL bloqueada: ${guard.reason}`)
  }

  const supabase = createServiceClient()

  // Retry on the (extremely unlikely) short_code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShortCode(10)
    const { data, error } = await supabase
      .from('tracking_links')
      .insert({
        organization_id: input.organizationId,
        lead_id: input.leadId ?? null,
        campaign_id: input.campaignId ?? null,
        agent_run_id: input.agentRunId ?? null,
        short_code: code,
        target_url: input.targetUrl,
        label: input.label ?? null,
        expires_at: input.expiresAt ?? null,
        created_by: input.createdBy ?? null,
      })
      .select('id, short_code')
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') continue // collision
      throw error
    }

    return {
      id: data.id as string,
      shortCode: data.short_code as string,
      publicUrl: buildPublicUrl(data.short_code as string),
    }
  }
  throw new Error('Falha ao gerar short_code único após 5 tentativas')
}

export function buildPublicUrl(shortCode: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ??
    ''
  if (!base) return `/r/${shortCode}`
  return `${base}/r/${shortCode}`
}

/**
 * Resolve `{link:URL}` placeholders inside an outbound message body to
 * real tracked URLs scoped to the send. Called by send_message tool right
 * before dispatching.
 *
 * Syntax variants:
 *   {link:https://example.com/offer}
 *   {link:https://example.com/offer|label=Oferta Q4}
 *
 * Malformed patterns are left in place (safer than silently stripping — the
 * operator sees something is wrong).
 */
export async function resolveMessageTemplate(args: {
  content: string
  organizationId: string
  leadId?: string | null
  campaignId?: string | null
  agentRunId?: string | null
}): Promise<string> {
  const pattern = /\{link:([^}]+)\}/g
  const matches = [...args.content.matchAll(pattern)]
  if (matches.length === 0) return args.content

  let resolved = args.content
  for (const m of matches) {
    const body = m[1]
    const [rawUrl, ...rest] = body.split('|')
    const url = rawUrl.trim()
    if (!url) continue
    let label: string | null = null
    for (const part of rest) {
      const eq = part.indexOf('=')
      if (eq > 0) {
        const key = part.slice(0, eq).trim()
        const value = part.slice(eq + 1).trim()
        if (key === 'label') label = value
      }
    }
    try {
      const created = await createTrackingLink({
        organizationId: args.organizationId,
        leadId: args.leadId,
        campaignId: args.campaignId,
        agentRunId: args.agentRunId,
        targetUrl: url,
        label,
      })
      resolved = resolved.replace(m[0], created.publicUrl)
    } catch {
      // Leave the `{link:...}` token in place so the operator notices.
      continue
    }
  }
  return resolved
}
