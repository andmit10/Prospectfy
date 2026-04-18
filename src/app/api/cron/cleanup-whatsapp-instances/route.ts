import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteInstance } from '@/lib/channels/providers/whatsapp/evolution-go-admin'
import { childLogger } from '@/lib/logger'

/**
 * Daily cleanup of WhatsApp instances that have been disconnected for 7+
 * days. Keeps the shared Evolution Go VPS from accumulating orphan slots
 * when customers disconnect and never reconnect.
 *
 * Contract:
 *   - Only deletes `provider='evolution_go'` rows (other providers aren't
 *     provisioned by us and we have no right to delete them remotely).
 *   - Looks at `metadata->>'disconnected_at'` timestamp (set by the
 *     lifecycle handler on `LoggedOut` events). Falls back to `updated_at`
 *     when the metadata timestamp is missing (legacy rows).
 *   - Tries remote `DELETE /instance/delete/{id}` first; on 404 we still
 *     delete the DB row (server is already out of sync, don't block).
 *   - Logs to audit_log so super-admins can see what was cleaned up.
 *
 * Schedule: daily at 03:00 UTC via GitHub Actions (.github/workflows/cron-daily.yml).
 * Manual trigger: POST /api/cron/cleanup-whatsapp-instances with the CRON_SECRET.
 */

const DAYS_DISCONNECTED = 7

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request): Promise<Response> {
  // Accept either Bearer auth (Vercel style) or x-cron-secret header
  // (matches the existing GitHub Actions workflow). Either must equal
  // the CRON_SECRET env var; both missing = 401.
  const cronSecret = process.env.CRON_SECRET
  const bearer = request.headers.get('authorization')
  const custom = request.headers.get('x-cron-secret')
  const match =
    (bearer && bearer === `Bearer ${cronSecret}`) ||
    (custom && custom === cronSecret)
  if (cronSecret && !match) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = childLogger('cron:cleanup-whatsapp-instances')
  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - DAYS_DISCONNECTED * 86400_000).toISOString()

  // Two pass fetch: we can't easily index metadata->>'disconnected_at', so
  // we fetch disconnected rows that are also stale by updated_at (cheap
  // index) and then filter on the JSON field in memory. Volumes are low
  // enough (a few hundred abandoned instances across all customers) that
  // this is fine for a daily job.
  const { data: rows, error } = await supabase
    .from('channel_integrations')
    .select('id, organization_id, provider, status, metadata, updated_at')
    .eq('provider', 'evolution_go')
    .eq('status', 'disconnected')
    .lt('updated_at', cutoff)
    .limit(200)

  if (error) {
    log.error('fetch failed', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stale = (rows ?? []).filter((r) => {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {}
    const dAt =
      typeof meta.disconnected_at === 'string' ? meta.disconnected_at : null
    // Prefer the explicit timestamp; fall back to updated_at when absent
    // (legacy rows created before the lifecycle handler shipped).
    const reference = dAt ?? (r.updated_at as string)
    return new Date(reference).getTime() < Date.now() - DAYS_DISCONNECTED * 86400_000
  })

  const cleaned: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const row of stale) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {}
    const instanceId =
      typeof meta.instance_id === 'string' ? meta.instance_id : null

    try {
      if (instanceId) {
        await deleteInstance(instanceId)
      }
      await supabase
        .from('channel_integrations')
        .delete()
        .eq('id', row.id)

      await supabase.from('audit_log').insert({
        org_id: row.organization_id,
        action: 'cleanup_whatsapp_instance',
        target_type: 'channel_integration',
        target_id: row.id,
        metadata: {
          instance_id: instanceId,
          disconnected_at: meta.disconnected_at ?? null,
          reason: `Disconnected for ${DAYS_DISCONNECTED}+ days`,
        },
      })

      cleaned.push(row.id as string)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('cleanup failed for row — left in place for next run', {
        id: row.id,
        error: msg,
      })
      failed.push({ id: row.id as string, error: msg })
    }
  }

  log.info('cleanup summary', {
    scanned: rows?.length ?? 0,
    stale: stale.length,
    cleaned: cleaned.length,
    failed: failed.length,
  })

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    stale: stale.length,
    cleaned,
    failed,
  })
}
