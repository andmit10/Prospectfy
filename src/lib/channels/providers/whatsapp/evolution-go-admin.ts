import { Agent } from 'undici'
import { randomUUID } from 'node:crypto'
import { serverEnv } from '@/lib/env.server'

/**
 * Server-only admin operations against the **shared** Evolution Go server.
 * These call admin endpoints (`/instance/create`, `/instance/connect`,
 * `/instance/disconnect`, `/instance/delete/{id}`) using the GLOBAL_API_KEY,
 * which never leaves the server. The user-facing dispatcher uses the
 * per-instance token (see `evolution-go.ts`).
 *
 * For enterprise orgs that bring their own VPS, the operator manually
 * inserts a `channel_integrations` row with their own `baseUrl` — this
 * module is never invoked for those.
 */

let cachedDispatcher: Agent | undefined

function dispatcher(): Agent | undefined {
  if (!serverEnv.EVOLUTION_GO_SHARED_IGNORE_TLS) return undefined
  if (!cachedDispatcher) {
    cachedDispatcher = new Agent({ connect: { rejectUnauthorized: false } })
  }
  return cachedDispatcher
}

function readSharedConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = serverEnv.EVOLUTION_GO_SHARED_BASE_URL
  const apiKey = serverEnv.EVOLUTION_GO_SHARED_GLOBAL_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error(
      'Shared Evolution Go server not configured. Set EVOLUTION_GO_SHARED_BASE_URL + EVOLUTION_GO_SHARED_GLOBAL_API_KEY.'
    )
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

type FetchInit = Parameters<typeof fetch>[1] & { dispatcher?: Agent }

async function adminFetch(path: string, init: FetchInit = {}): Promise<Response> {
  const { baseUrl, apiKey } = readSharedConfig()
  const merged: FetchInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(init.headers ?? {}),
    },
  }
  const d = dispatcher()
  if (d) merged.dispatcher = d
  return fetch(`${baseUrl}${path}`, merged)
}

export type CreatedInstance = {
  id: string
  name: string
  token: string
}

/**
 * POST /instance/create — registers a new instance on the server.
 * Returns the canonical id + per-instance token we'll store encrypted.
 *
 * Note: Evolution Go REQUIRES `token` in the body (the UI auto-generates a
 * UUID; via API we have to do it ourselves). The token then becomes the
 * `apikey` header value for /send/* endpoints (per-instance auth).
 *
 * Errors:
 *   - 409 if name already exists. Caller should regenerate name + retry.
 *   - 401 → bad apikey (env var)
 */
export async function createInstance(name: string): Promise<CreatedInstance> {
  const token = randomUUID()
  const res = await adminFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ name, token }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution Go createInstance ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    data?: { id?: string; name?: string; token?: string }
    message?: string
  }
  const id = json.data?.id
  const returnedToken = json.data?.token
  if (!id || !returnedToken) {
    throw new Error(`createInstance returned malformed payload: ${JSON.stringify(json)}`)
  }
  return { id, name: json.data?.name ?? name, token: returnedToken }
}

/**
 * POST /instance/connect — starts pairing flow + registers webhook URL.
 * Evolution Go will then push a `QRCode` event to the webhook within ~2s.
 *
 * Auth note: despite what the docs imply, /instance/connect rejects the
 * GLOBAL_API_KEY with 401 ("not authorized") on this server build. The
 * per-instance token works for both fresh and already-paired instances,
 * so we use it. The token comes from createInstance().
 */
export async function connectInstance(args: {
  instanceId: string
  instanceToken: string
  webhookUrl: string
  events?: string[] // defaults to a sane set for our dispatcher
}): Promise<void> {
  const { baseUrl } = readSharedConfig()
  const subscribe = args.events ?? [
    'MESSAGE',
    'SEND_MESSAGE',
    'READ_RECEIPT',
    'CONNECTION',
    'QRCODE',
  ]
  const init: FetchInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: args.instanceToken,
      instanceId: args.instanceId,
    },
    body: JSON.stringify({
      webhookUrl: args.webhookUrl,
      subscribe,
      immediate: true,
    }),
  }
  const d = dispatcher()
  if (d) init.dispatcher = d

  const res = await fetch(`${baseUrl}/instance/connect`, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution Go connectInstance ${res.status}: ${text.slice(0, 200)}`)
  }
}

/** POST /instance/disconnect — logs out the WhatsApp session, instance stays. */
export async function disconnectInstance(instanceId: string): Promise<void> {
  const res = await adminFetch('/instance/disconnect', {
    method: 'POST',
    headers: { instanceId },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution Go disconnectInstance ${res.status}: ${text.slice(0, 200)}`)
  }
}

/** DELETE /instance/delete/{id} — removes the instance entirely. Used by cleanup cron. */
export async function deleteInstance(instanceId: string): Promise<void> {
  const res = await adminFetch(`/instance/delete/${encodeURIComponent(instanceId)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution Go deleteInstance ${res.status}: ${text.slice(0, 200)}`)
  }
}
