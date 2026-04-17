import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'

async function getClient() {
  const mod = await import('./directfy')
  return mod.directfy
}

function signHex(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

describe('directfy.verifyWebhookSignature', () => {
  const secret = 'super-secret-webhook-key'
  const payload = JSON.stringify({ message_id: 'm1', status: 'delivered' })

  it('accepts a valid signature', async () => {
    const directfy = await getClient()
    const sig = signHex(payload, secret)
    expect(await directfy.verifyWebhookSignature(payload, sig, secret)).toBe(true)
  })

  it('accepts a valid signature with sha256= prefix', async () => {
    const directfy = await getClient()
    const sig = `sha256=${signHex(payload, secret)}`
    expect(await directfy.verifyWebhookSignature(payload, sig, secret)).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const directfy = await getClient()
    const sig = signHex(payload, secret)
    const tampered = payload.replace('delivered', 'replied')
    expect(await directfy.verifyWebhookSignature(tampered, sig, secret)).toBe(false)
  })

  it('rejects a signature made with the wrong secret', async () => {
    const directfy = await getClient()
    const sig = signHex(payload, 'other-secret')
    expect(await directfy.verifyWebhookSignature(payload, sig, secret)).toBe(false)
  })

  it('rejects an empty or garbage signature', async () => {
    const directfy = await getClient()
    expect(await directfy.verifyWebhookSignature(payload, '', secret)).toBe(false)
    // 'nothex' can't be parsed as hex — Buffer.from returns empty buffer → verify fails
    expect(await directfy.verifyWebhookSignature(payload, 'nothex', secret)).toBe(false)
  })
})
