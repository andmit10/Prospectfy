import { describe, it, expect } from 'vitest'
import { computeTrialStatus, TRIAL_LEAD_LIMIT } from './limits'

const FIXED_NOW = new Date('2026-04-17T12:00:00Z')

describe('computeTrialStatus', () => {
  it('paid plans are never blocked, regardless of counters', () => {
    const s = computeTrialStatus({
      plan: 'starter',
      trialEndsAt: '2020-01-01T00:00:00Z',
      leadsGenerated: 9999,
      now: FIXED_NOW,
    })
    expect(s.blocked).toBe(false)
    expect(s.expired).toBe(false)
    expect(s.exhausted).toBe(false)
  })

  it('active trial with room shows days left and leads used', () => {
    const s = computeTrialStatus({
      plan: 'trial',
      trialEndsAt: '2026-04-22T12:00:00Z', // 5 days away
      leadsGenerated: 12,
      now: FIXED_NOW,
    })
    expect(s.daysLeft).toBe(5)
    expect(s.leadsGenerated).toBe(12)
    expect(s.leadsLimit).toBe(TRIAL_LEAD_LIMIT)
    expect(s.expired).toBe(false)
    expect(s.exhausted).toBe(false)
    expect(s.blocked).toBe(false)
  })

  it('blocks when 7-day window has passed', () => {
    const s = computeTrialStatus({
      plan: 'trial',
      trialEndsAt: '2026-04-10T00:00:00Z',
      leadsGenerated: 0,
      now: FIXED_NOW,
    })
    expect(s.expired).toBe(true)
    expect(s.blocked).toBe(true)
    expect(s.daysLeft).toBe(0)
  })

  it('blocks when lead quota is exhausted, even inside window', () => {
    const s = computeTrialStatus({
      plan: 'trial',
      trialEndsAt: '2026-04-22T12:00:00Z',
      leadsGenerated: TRIAL_LEAD_LIMIT,
      now: FIXED_NOW,
    })
    expect(s.exhausted).toBe(true)
    expect(s.blocked).toBe(true)
    expect(s.expired).toBe(false)
  })

  it('treats missing trial_ends_at as non-expired (new org edge case)', () => {
    const s = computeTrialStatus({
      plan: 'trial',
      trialEndsAt: null,
      leadsGenerated: 0,
      now: FIXED_NOW,
    })
    expect(s.expired).toBe(false)
    expect(s.blocked).toBe(false)
    expect(s.daysLeft).toBe(0)
  })
})
