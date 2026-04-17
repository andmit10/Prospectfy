import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { detectBot } from '@/lib/pipeline'
import { onClickEvent } from '@/lib/pipeline/auto-progression'

/**
 * Public redirect route for tracking links. Receives any hit (GET/HEAD)
 * on `/r/:code`, records an event, and redirects to the target URL.
 *
 * Bot-aware: known scanners/previews are logged with `is_bot=true` and
 * DON'T trigger pipeline progression. Real human clicks drive the rule
 * engine via `onClickEvent`.
 *
 * Kept on the Node runtime so `crypto` + `createServiceClient` work.
 */

export const runtime = 'nodejs'
// Short cache is OK for the code→target lookup; bypass on HEAD to avoid
// email scanners polluting the per-link click counts.
export const dynamic = 'force-dynamic'

type LinkRow = {
  id: string
  organization_id: string
  lead_id: string | null
  agent_run_id: string | null
  target_url: string
  expires_at: string | null
  click_count: number
  unique_click_count: number
  first_click_at: string | null
}

async function resolveLink(code: string): Promise<LinkRow | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('tracking_links')
    .select(
      'id, organization_id, lead_id, agent_run_id, target_url, expires_at, click_count, unique_click_count, first_click_at'
    )
    .eq('short_code', code)
    .maybeSingle()
  return (data as LinkRow | null) ?? null
}

async function logAndMaybeProgress(args: {
  link: LinkRow
  method: string
  req: NextRequest
}): Promise<void> {
  const supabase = createServiceClient()
  const ua = args.req.headers.get('user-agent')
  const ip =
    args.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    args.req.headers.get('x-real-ip') ??
    null
  const referer = args.req.headers.get('referer') ?? null
  const country =
    args.req.headers.get('x-vercel-ip-country') ??
    args.req.headers.get('cf-ipcountry') ??
    null

  const verdict = detectBot({
    userAgent: ua,
    method: args.method,
    previousClicks: args.link.click_count,
  })

  const { data: inserted, error: eventErr } = await supabase
    .from('tracking_events')
    .insert({
      link_id: args.link.id,
      lead_id: args.link.lead_id,
      organization_id: args.link.organization_id,
      event_type: 'click',
      ip,
      user_agent: ua,
      country,
      referer,
      is_bot: verdict.isBot,
      bot_reason: verdict.reason ?? null,
    })
    .select('id')
    .single()

  if (eventErr) {
    console.error('[/r] event insert failed:', eventErr)
    return
  }

  // Bump counters only on real clicks — bot hits stay out of the headline
  // metrics to keep dashboards honest.
  if (!verdict.isBot) {
    const now = new Date().toISOString()
    await supabase
      .from('tracking_links')
      .update({
        click_count: args.link.click_count + 1,
        // unique_click_count bumped once (on first real click). A proper
        // per-IP dedup lands in Phase 5.1 once we have enough real traffic
        // to justify the added read cost.
        unique_click_count:
          args.link.unique_click_count === 0 ? 1 : args.link.unique_click_count,
        first_click_at: args.link.first_click_at ?? now,
        last_click_at: now,
      })
      .eq('id', args.link.id)

    // Fire the rule engine — non-blocking; never throws.
    try {
      await onClickEvent({
        orgId: args.link.organization_id,
        leadId: args.link.lead_id,
        trackingLinkId: args.link.id,
        trackingEventId: inserted.id as string,
        agentRunId: args.link.agent_run_id,
      })
    } catch (err) {
      console.error('[/r] auto-progression failed:', err)
    }
  }
}

async function handle(request: NextRequest, ctxParams: { code: string }): Promise<Response> {
  const { code } = ctxParams
  if (!code || code.length < 6 || code.length > 40 || !/^[A-Za-z0-9]+$/.test(code)) {
    return NextResponse.json({ error: 'código inválido' }, { status: 400 })
  }

  const link = await resolveLink(code)
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expirado' }, { status: 410 })
  }

  // Safe target parse — belt-and-suspenders (we validated at create time too).
  let target: string
  try {
    target = new URL(link.target_url).toString()
  } catch {
    return NextResponse.json({ error: 'URL de destino inválida' }, { status: 500 })
  }

  // Fire-and-forget logging so the redirect stays snappy. We still await to
  // guarantee the event hits the DB before the user sees the page (matters
  // for correct attribution when the user reloads).
  await logAndMaybeProgress({ link, method: request.method, req: request })

  return NextResponse.redirect(target, 302)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<Response> {
  return handle(request, await context.params)
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
): Promise<Response> {
  return handle(request, await context.params)
}
