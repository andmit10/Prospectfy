import { createServiceClient } from '@/lib/supabase/service'

/**
 * Evolution Go fires lifecycle events that don't map to a single message —
 * they describe the connection itself:
 *
 *   QRCode               → push the new base64 QR into metadata so the
 *                          UI poll picks it up
 *   PairSuccess          → ignore (Connected follows immediately)
 *   Connected            → flip integration.status='active', set connected_at
 *   OfflineSyncCompleted → ignore (informational)
 *   LoggedOut            → flip status='disconnected', set metadata.disconnected_at
 *                          so the 7-day cleanup cron can find it
 *
 * Returns the event name when handled (caller short-circuits) or null when
 * the payload wasn't a lifecycle event we care about.
 */
export async function applyEvolutionGoLifecycle(args: {
  integrationId: string
  rawBody: string
}): Promise<string | null> {
  let body: { event?: string; data?: { qrcode?: string; QRCode?: string } }
  try {
    body = JSON.parse(args.rawBody)
  } catch {
    return null
  }

  const event = body.event
  if (!event) return null

  // Lifecycle events we care about
  const lifecycle = new Set(['QRCode', 'Connected', 'LoggedOut'])
  if (!lifecycle.has(event)) return null

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Pull existing metadata so we don't clobber unrelated keys.
  const { data: row } = await supabase
    .from('channel_integrations')
    .select('metadata')
    .eq('id', args.integrationId)
    .maybeSingle()

  const meta = (row?.metadata as Record<string, unknown> | null) ?? {}

  if (event === 'QRCode') {
    // Evolution Go ships the QR as base64 in `data.qrcode` (lowercase).
    const qr = body.data?.qrcode ?? body.data?.QRCode ?? null
    if (!qr) return event
    await supabase
      .from('channel_integrations')
      .update({
        metadata: { ...meta, qr_code: qr, qr_updated_at: now },
        updated_at: now,
      })
      .eq('id', args.integrationId)
    return event
  }

  if (event === 'Connected') {
    // Clear the QR (no longer valid), mark active, stamp connected_at.
    const cleaned = { ...meta }
    delete cleaned.qr_code
    delete cleaned.qr_updated_at
    delete cleaned.disconnected_at
    await supabase
      .from('channel_integrations')
      .update({
        status: 'active',
        connected_at: now,
        consecutive_failures: 0,
        last_error: null,
        last_error_at: null,
        metadata: cleaned,
        updated_at: now,
      })
      .eq('id', args.integrationId)
    return event
  }

  if (event === 'LoggedOut') {
    await supabase
      .from('channel_integrations')
      .update({
        status: 'disconnected',
        metadata: { ...meta, disconnected_at: now },
        updated_at: now,
      })
      .eq('id', args.integrationId)
    return event
  }

  return null
}
