import { NextResponse } from 'next/server'
import IORedis from 'ioredis'
import { childLogger } from '@/lib/logger'

const log = childLogger('rate-limit')

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number // unix epoch ms when the current window ends
}

export type RateLimitOpts = {
  /** Stable identifier of what we're rate-limiting (endpoint + principal). */
  key: string
  /** Max requests allowed inside the window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
}

// Singleton connection — workers already hold their own connection, but the
// Next.js runtime is separate and we don't want to reconnect per request.
let redis: IORedis | null = null
let redisErrored = false

function getRedis(): IORedis | null {
  if (redis || redisErrored) return redis
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: false,
    })
    redis.on('error', (err) => {
      // Don't spam logs — mark the client as errored so we fail open until next deploy.
      if (!redisErrored) {
        log.error('redis connection failed; rate limiting disabled', {
          error: err.message,
        })
        redisErrored = true
      }
    })
  } catch (err) {
    log.error('failed to init redis for rate limiting', {
      error: err instanceof Error ? err.message : String(err),
    })
    redisErrored = true
    return null
  }
  return redis
}

/**
 * Fixed-window counter. Simpler and cheaper than sliding window; fine for the
 * buckets we care about (per-IP, per-org) because the hotspot we're protecting
 * against is short bursts, not steady-state fairness.
 *
 * Fails OPEN when Redis is unreachable — a broken cache must not take the API
 * down. Callers that need a stricter policy can re-check the `allowed` flag
 * after awaiting this.
 */
export async function rateLimit(opts: RateLimitOpts): Promise<RateLimitResult> {
  const client = getRedis()
  const now = Date.now()
  const resetAt = now + opts.windowSec * 1000

  if (!client) {
    // Fail open in local/dev without Redis.
    return { allowed: true, limit: opts.limit, remaining: opts.limit, resetAt }
  }

  const redisKey = `rl:${opts.key}`
  try {
    const pipeline = client.multi()
    pipeline.incr(redisKey)
    pipeline.expire(redisKey, opts.windowSec, 'NX') // set TTL only on first hit
    pipeline.pttl(redisKey)
    const results = await pipeline.exec()
    if (!results) {
      return { allowed: true, limit: opts.limit, remaining: opts.limit, resetAt }
    }
    const count = Number(results[0]?.[1] ?? 0)
    const pttlMs = Number(results[2]?.[1] ?? opts.windowSec * 1000)
    const resetsAt = now + (pttlMs > 0 ? pttlMs : opts.windowSec * 1000)
    const remaining = Math.max(0, opts.limit - count)
    return {
      allowed: count <= opts.limit,
      limit: opts.limit,
      remaining,
      resetAt: resetsAt,
    }
  } catch (err) {
    log.warn('rate limit check failed; allowing request', {
      error: err instanceof Error ? err.message : String(err),
      key: opts.key,
    })
    return { allowed: true, limit: opts.limit, remaining: opts.limit, resetAt }
  }
}

/**
 * Derive a client identifier from request headers. Prefers the left-most
 * x-forwarded-for entry (Vercel normalises this), falls back to x-real-ip,
 * and finally returns 'anon' so the limiter never throws for missing headers.
 */
export function clientIdFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'anon'
}

/**
 * Convenience wrapper that returns a ready 429 NextResponse if the bucket is
 * exhausted, otherwise returns null so the handler can continue.
 */
export async function enforceRateLimit(
  opts: RateLimitOpts
): Promise<NextResponse | null> {
  const result = await rateLimit(opts)
  if (result.allowed) return null
  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.resetAt - Date.now()) / 1000)
  )
  return NextResponse.json(
    { error: 'Muitas requisições. Tente novamente em instantes.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}
