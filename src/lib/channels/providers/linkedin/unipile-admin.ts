import { serverEnv } from '@/lib/env.server'

/**
 * Server-only admin operations against Unipile using the OPERATOR-level
 * credentials (set via UNIPILE_MANAGED_DSN + UNIPILE_MANAGED_API_KEY).
 * Used exclusively by the Managed model — the BYOU model uses customer
 * credentials and hits Unipile directly via the regular provider code.
 *
 * Docs: https://docs.unipile.com/reference
 */

export function isManagedAvailable(): boolean {
  return Boolean(
    serverEnv.UNIPILE_MANAGED_DSN && serverEnv.UNIPILE_MANAGED_API_KEY
  )
}

function readManagedConfig(): { dsn: string; apiKey: string } {
  const dsn = serverEnv.UNIPILE_MANAGED_DSN
  const apiKey = serverEnv.UNIPILE_MANAGED_API_KEY
  if (!dsn || !apiKey) {
    throw new Error(
      'Unipile Managed não configurado. Defina UNIPILE_MANAGED_DSN + UNIPILE_MANAGED_API_KEY.'
    )
  }
  return { dsn: dsn.replace(/^https?:\/\//, '').replace(/\/$/, ''), apiKey }
}

function buildBaseUrl(dsn: string): string {
  return `https://${dsn}/api/v1`
}

async function managedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { dsn, apiKey } = readManagedConfig()
  return fetch(`${buildBaseUrl(dsn)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export type HostedAuthLink = {
  url: string
  name: string // correlation id we sent to Unipile
  expiresAt: string
}

/**
 * POST /hosted/accounts/link — asks Unipile for a URL that the customer
 * opens in a new tab to log into LinkedIn. Unipile handles the OAuth
 * handshake and calls our `account-linked` webhook when done.
 *
 * `name` is a correlation id — we use it on the webhook side to find the
 * pending integration row and attach the returned account_id.
 */
export async function createHostedAuthLink(args: {
  integrationId: string
  expiresInMinutes?: number // default 30
}): Promise<HostedAuthLink> {
  const expiresAt = new Date(
    Date.now() + (args.expiresInMinutes ?? 30) * 60_000
  ).toISOString()
  const name = `orbya:${args.integrationId}`

  const appUrl = serverEnv.NEXT_PUBLIC_APP_URL
  const res = await managedFetch('/hosted/accounts/link', {
    method: 'POST',
    body: JSON.stringify({
      type: 'create',
      providers: ['LINKEDIN'],
      api_url: `${appUrl}/api/webhooks/unipile/account-linked?integration=${encodeURIComponent(args.integrationId)}`,
      success_redirect_url: `${appUrl}/settings/integrations?unipile=success`,
      failure_redirect_url: `${appUrl}/settings/integrations?unipile=failure`,
      notify_url: `${appUrl}/api/webhooks/unipile/account-linked?integration=${encodeURIComponent(args.integrationId)}`,
      expiresOn: expiresAt,
      name,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Unipile createHostedAuthLink ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { url?: string; object?: string }
  if (!json.url) {
    throw new Error(`Unipile hosted link malformed: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return { url: json.url, name, expiresAt }
}

/**
 * DELETE /accounts/{id} — removes the LinkedIn account from our operator
 * workspace. Called when the customer deletes the integration so we stop
 * being billed for it.
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const res = await managedFetch(`/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Unipile deleteAccount ${res.status}: ${text.slice(0, 200)}`)
  }
}
