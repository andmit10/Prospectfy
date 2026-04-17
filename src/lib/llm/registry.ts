import { createServiceClient } from '@/lib/supabase/service'
import type { LlmModel, LlmRoute, LlmTask } from './types'

/**
 * In-memory cache of llm_models + llm_routes. Reloaded every REFRESH_MS so
 * operators can flip `enabled` / change a route via the admin dashboard
 * without a redeploy. Per-process cache — cold start or process restart
 * triggers a fresh read.
 *
 * Uses the service role (bypasses RLS) since these tables are operator
 * configuration, not customer data.
 */

const REFRESH_MS = 60_000

type CacheSnapshot = {
  loadedAt: number
  models: Map<string, LlmModel>
  routes: Map<LlmTask, LlmRoute>
}

let cache: CacheSnapshot | null = null
let inflight: Promise<CacheSnapshot> | null = null

async function loadSnapshot(): Promise<CacheSnapshot> {
  const supabase = createServiceClient()

  const [modelsRes, routesRes] = await Promise.all([
    supabase.from('llm_models').select('*'),
    supabase.from('llm_routes').select('*'),
  ])

  if (modelsRes.error) throw modelsRes.error
  if (routesRes.error) throw routesRes.error

  const models = new Map<string, LlmModel>()
  for (const row of modelsRes.data ?? []) {
    models.set(row.id, row as LlmModel)
  }

  const routes = new Map<LlmTask, LlmRoute>()
  for (const row of routesRes.data ?? []) {
    routes.set(row.task as LlmTask, row as LlmRoute)
  }

  return { loadedAt: Date.now(), models, routes }
}

async function ensureCache(): Promise<CacheSnapshot> {
  if (cache && Date.now() - cache.loadedAt < REFRESH_MS) return cache
  // Coalesce concurrent loads so we don't thunder the DB at startup.
  if (!inflight) {
    inflight = loadSnapshot()
      .then((snap) => {
        cache = snap
        return snap
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export async function getModel(id: string): Promise<LlmModel | null> {
  const snap = await ensureCache()
  return snap.models.get(id) ?? null
}

export async function getRoute(task: LlmTask): Promise<LlmRoute | null> {
  const snap = await ensureCache()
  return snap.routes.get(task) ?? null
}

/**
 * Resolve primary + fallback for a task. Falls back gracefully when the
 * primary model is disabled (operator toggled off in admin UI), so callers
 * never hit a disabled endpoint.
 */
export async function resolveTaskModels(
  task: LlmTask
): Promise<{ primary: LlmModel | null; fallback: LlmModel | null; route: LlmRoute | null }> {
  const snap = await ensureCache()
  const route = snap.routes.get(task) ?? null
  if (!route) return { primary: null, fallback: null, route: null }

  const rawPrimary = snap.models.get(route.primary_model_id) ?? null
  const rawFallback = route.fallback_model_id
    ? snap.models.get(route.fallback_model_id) ?? null
    : null

  // A disabled primary is treated as unusable — the router will skip straight
  // to the fallback. We still return the model so telemetry can label it.
  const primary = rawPrimary?.enabled ? rawPrimary : null
  const fallback = rawFallback?.enabled ? rawFallback : null

  return { primary, fallback, route }
}

/**
 * Test-only: drop the cache so the next call hits the DB. Never called in
 * production paths.
 */
export function __resetRegistryCache() {
  cache = null
  inflight = null
}
