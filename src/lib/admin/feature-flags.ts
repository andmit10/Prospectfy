import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

/**
 * Feature flag resolution — server-side helper used by tRPC procedures and
 * server components to gate pages/features.
 *
 * Resolution order:
 *   1. `globally_enabled` — shortcut for everyone
 *   2. `enabled_for_orgs[]` contains the org id
 *   3. `enabled_for_plans[]` contains the org's plan
 *
 * We rely on the `public.is_feature_enabled` SQL function (migration
 * 20260417000009) as the source of truth — the SQL + helper give us one
 * algorithm, two entry points.
 *
 * Values are cached in-process for 60s to avoid hammering Postgres on
 * every request. Cache is per-process so a flag flip propagates within
 * the TTL.
 */

type CacheEntry = {
  expiresAt: number
  value: boolean
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function cacheKey(orgId: string, key: string): string {
  return `${orgId}::${key}`
}

/**
 * SSR-safe check — uses the session's Supabase client (RLS on feature_flags
 * is open-read, so this works for any signed-in user).
 */
export async function isFeatureEnabled(orgId: string, flagKey: string): Promise<boolean> {
  const k = cacheKey(orgId, flagKey)
  const hit = cache.get(k)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const supabase = await createClient()
  const { data } = await supabase.rpc('is_feature_enabled', {
    p_key: flagKey,
    p_org_id: orgId,
  })

  const value = Boolean(data)
  cache.set(k, { expiresAt: Date.now() + CACHE_TTL_MS, value })
  return value
}

/**
 * Worker / background-job variant — bypasses session (service role) so
 * workers never fail flag checks due to missing auth.
 */
export async function isFeatureEnabledAsWorker(
  orgId: string,
  flagKey: string
): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase.rpc('is_feature_enabled', {
    p_key: flagKey,
    p_org_id: orgId,
  })
  return Boolean(data)
}

export function __invalidateFeatureFlagCache() {
  cache.clear()
}
