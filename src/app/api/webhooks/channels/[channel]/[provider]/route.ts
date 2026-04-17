import { NextResponse, type NextRequest } from 'next/server'
import { handleWebhook, type Channel } from '@/lib/channels'
import { onInboundMessage } from '@/lib/pipeline/auto-progression'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Unified channel webhook entrypoint. The path is:
 *
 *   /api/webhooks/channels/{channel}/{provider}
 *
 * Each provider's `parseWebhook` receives the raw body + headers and
 * verifies its own signature. We never trust query params; all integration
 * resolution happens inside the provider when possible (via signed payload).
 *
 * Security:
 *   - Raw body is read ONCE as text and passed as-is for HMAC verification.
 *   - We return 200 on parse failure with a noop body — providers usually
 *     retry on non-2xx, so silently dropping invalid signatures is safer
 *     than bouncing them (avoids retry storms when a secret is rotated).
 *   - Providers without a configured webhook secret simply drop the event.
 *
 * Note: an optional `?integration={uuid}` can be supplied so providers that
 * don't embed the integration id in their payload (like generic_webhook)
 * can be resolved. We re-validate ownership by RLS at load time.
 */

const VALID_CHANNELS = new Set<Channel>([
  'whatsapp',
  'email',
  'linkedin',
  'instagram',
  'sms',
])

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ channel: string; provider: string }> }
): Promise<Response> {
  const { channel, provider } = await context.params

  if (!VALID_CHANNELS.has(channel as Channel)) {
    // Treat unknown channels as 204 — providers won't retry, noise in logs
    // stays low.
    return new Response(null, { status: 204 })
  }

  const url = new URL(request.url)
  const integrationId = url.searchParams.get('integration') ?? undefined

  // Read raw body once — we pass the string to the provider for signature
  // verification. Never .json() here; that re-serializes and breaks HMAC.
  const rawBody = await request.text()

  try {
    const result = await handleWebhook({
      channel: channel as Channel,
      providerId: provider,
      input: {
        integrationId,
        headers: request.headers,
        rawBody,
      },
    })

    if (!result.processed) {
      // Parse failed / signature bad / no matching row — respond 200 so
      // providers don't retry. Log the outcome at debug level elsewhere.
      return NextResponse.json({ processed: false })
    }

    // If this was an inbound message that we persisted, fire auto-progression.
    // Keeping it here (not inside dispatcher) means one place to reason about
    // "message landed → pipeline may move". Non-blocking wrap — a classify
    // failure never costs the webhook its 2xx.
    if (result.event?.inbound && result.messageId) {
      try {
        const supabase = createServiceClient()
        const { data: msg } = await supabase
          .from('channel_messages')
          .select('organization_id, lead_id, content')
          .eq('id', result.messageId)
          .maybeSingle()
        if (msg?.organization_id && msg.content) {
          await onInboundMessage({
            orgId: msg.organization_id as string,
            leadId: (msg.lead_id as string | null) ?? null,
            channelMessageId: result.messageId,
            content: msg.content as string,
          })
        }
      } catch (err) {
        console.error('[channels/webhook] auto-progression failed:', err)
      }
    }

    return NextResponse.json({ processed: true, messageId: result.messageId })
  } catch (err) {
    console.error('[channels/webhook] error:', err)
    // Return 500 so providers retry (probably a transient DB hiccup).
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

// Some providers (Meta, LinkedIn challenge) use GET for webhook verification.
// We echo the `hub.challenge` when present — harmless for everyone else.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ channel: string; provider: string }> }
): Promise<Response> {
  const { channel, provider } = await context.params
  if (!VALID_CHANNELS.has(channel as Channel)) {
    return new Response(null, { status: 204 })
  }

  // Meta-style challenge echo.
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return NextResponse.json({ channel, provider, ok: true })
}
