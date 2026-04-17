import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ioredis before importing the module under test. Redis is injected via
// `new IORedis(url)` so we stub the default export to a programmable multi().
const multiState: { incrReturn: number; pttlReturn: number; throwOnExec: boolean } = {
  incrReturn: 1,
  pttlReturn: 60_000,
  throwOnExec: false,
}

vi.mock('ioredis', () => {
  class FakeRedis {
    on() {}
    multi() {
      return {
        incr: () => this,
        expire: () => this,
        pttl: () => this,
        exec: async () => {
          if (multiState.throwOnExec) throw new Error('redis down')
          return [
            [null, multiState.incrReturn],
            [null, 1],
            [null, multiState.pttlReturn],
          ] as unknown as [Error | null, unknown][]
        },
      }
    }
  }
  return { default: FakeRedis }
})

describe('rateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
    multiState.incrReturn = 1
    multiState.pttlReturn = 60_000
    multiState.throwOnExec = false
    process.env.REDIS_URL = 'redis://localhost:6379'
  })

  afterEach(() => {
    delete process.env.REDIS_URL
  })

  it('allows requests inside the limit', async () => {
    const { rateLimit } = await import('./rate-limit')
    multiState.incrReturn = 3
    const r = await rateLimit({ key: 'k1', limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(2)
  })

  it('blocks once the counter exceeds the limit', async () => {
    const { rateLimit } = await import('./rate-limit')
    multiState.incrReturn = 6
    const r = await rateLimit({ key: 'k1', limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('fails open when redis throws', async () => {
    const { rateLimit } = await import('./rate-limit')
    multiState.throwOnExec = true
    const r = await rateLimit({ key: 'k1', limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(true)
  })

  it('fails open when REDIS_URL is unset (local dev)', async () => {
    delete process.env.REDIS_URL
    const { rateLimit } = await import('./rate-limit')
    const r = await rateLimit({ key: 'k1', limit: 5, windowSec: 60 })
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(5)
  })
})

describe('clientIdFromRequest', () => {
  it('uses the first entry in x-forwarded-for', async () => {
    const { clientIdFromRequest } = await import('./rate-limit')
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(clientIdFromRequest(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then anon', async () => {
    const { clientIdFromRequest } = await import('./rate-limit')
    const req = new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } })
    expect(clientIdFromRequest(req)).toBe('9.9.9.9')
    const bare = new Request('http://x')
    expect(clientIdFromRequest(bare)).toBe('anon')
  })
})
