import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { encryptConfig, decryptConfig } from '@/lib/channels/crypto'
import { childLogger } from '@/lib/logger'

/**
 * Unipile "account linked" webhook.
 *
 * After the customer finishes the hosted auth flow (login LinkedIn via
 * Unipile's iframe), Unipile POSTs here with the new account_id. We:
 *   1. Resolve the pending integration via ?integration= query param
 *   2. Decrypt its current config (operator DSN + apiKey), inject the
 *      account_id, re-encrypt
 *   3. Flip status to 'active', clear metadata.auth_pending
 *
 * Note: Unipile doesn't sign this webhook — the `integration` query param
 * is our correlation id (a random UUID the operator controls). Leaking it
 * only lets an attacker flip a pending integration to 'active' with their
 * own LinkedIn, which would break their session but not ours.
 */

const log = childLogger('webhook:unipile:account-linked')

export async function POST(request: NextRequest) {
  return handle(request)
}

// Some Unipile configs ping via GET during redirect; tolerate both.
export async function GET(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest): Promise<Response> {
  const url = new URL(request.url)
  const integrationId = url.searchParams.get('integration')
  if (!integrationId) {
    return NextResponse.json({ error: 'missing_integration_id' }, { status: 400 })
  }

  let body: {
    status?: string
    account_id?: string
    accountId?: string
    name?: string
  } = {}
  try {
    body = await request.json()
  } catch {
    // Unipile sometimes redirects via GET with query params instead of body
    body = {
      status: url.searchParams.get('status') ?? undefined,
      account_id: url.searchParams.get('account_id') ?? undefined,
      name: url.searchParams.get('name') ?? undefined,
    }
  }

  const accountId = body.account_id ?? body.accountId ?? null
  const status = (body.status ?? '').toUpperCase()

  if (!accountId || (status && status !== 'OK' && status !== 'CREATION_SUCCESS')) {
    log.warn('webhook payload without accountId or with failure status', { integrationId, status })
    // Return 200 so Unipile doesn't retry; we leave the integration in disconnected state.
    return NextResponse.json({ received: true, processed: false })
  }

  const supabase = createServiceClient()
  const { data: row, error: fetchErr } = await supabase
    .from('channel_integrations')
    .select('id, config, metadata')
    .eq('id', integrationId)
    .maybeSingle()

  if (fetchErr || !row) {
    log.warn('integration not found', { integrationId, error: fetchErr?.message })
    return NextResponse.json({ error: 'integration_not_found' }, { status: 404 })
  }

  // Decrypt existing config (has operator dsn + apiKey, empty accountId),
  // inject the accountId, re-encrypt.
  let decrypted: Record<string, unknown>
  try {
    decrypted = decryptConfig(row.config as Record<string, unknown>)
  } catch (err) {
    log.error('decrypt failed on webhook', {
      integrationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'decrypt_failed' }, { status: 500 })
  }

  decrypted.accountId = accountId
  const reencrypted = encryptConfig(decrypted)

  const priorMeta = (row.metadata as Record<string, unknown> | null) ?? {}
  const nextMeta = { ...priorMeta }
  delete nextMeta.auth_pending
  nextMeta.account_id = accountId
  nextMeta.connected_via = 'hosted_auth'

  await supabase
    .from('channel_integrations')
    .update({
      config: reencrypted,
      status: 'active',
      connected_at: new Date().toISOString(),
      consecutive_failures: 0,
      last_error: null,
      last_error_at: null,
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId)

  log.info('linked unipile account to integration', { integrationId, accountId })

  return NextResponse.json({ received: true, processed: true })
}
