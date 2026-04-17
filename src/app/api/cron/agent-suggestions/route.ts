import { NextResponse } from 'next/server'
import { enqueueForAllActiveOrgs } from '../../../../../workers/agent-suggestions-worker'

/**
 * Nightly cron endpoint that fans out agent-suggestion jobs to every active
 * org. Called by Vercel Cron (or any external scheduler) with the shared
 * `CRON_SECRET` header.
 */

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const provided = request.headers.get('x-cron-secret') ?? ''
  const expected = process.env.CRON_SECRET ?? ''
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  try {
    const count = await enqueueForAllActiveOrgs()
    return NextResponse.json({ enqueued: count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
