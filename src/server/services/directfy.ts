import { serverEnv } from '@/lib/env'

interface SendMessageParams {
  phone: string
  message: string
  lead_id: string
}

interface SendMessageResult {
  message_id: string
  status: 'queued' | 'sent' | 'failed'
}

interface DirectfyWebhookPayload {
  message_id: string
  phone: string
  status: 'delivered' | 'read' | 'replied'
  reply_text?: string
  timestamp: string
}

class DirectfyClient {
  private readonly baseUrl: string
  private apiKey: string | null = null

  constructor() {
    this.baseUrl = serverEnv.DIRECTFY_API_URL
  }

  // Called per-request with the user's stored API key
  withKey(apiKey: string): this {
    this.apiKey = apiKey
    return this
  }

  private get headers() {
    if (!this.apiKey) throw new Error('Directfy API key not configured')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        to: params.phone,
        type: 'text',
        text: { body: params.message },
        metadata: { lead_id: params.lead_id },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Directfy sendMessage failed ${res.status}: ${body}`)
    }

    return res.json() as Promise<SendMessageResult>
  }

  // Validate incoming webhook signature (HMAC-SHA256)
  async verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const sigBytes = Buffer.from(signature.replace('sha256=', ''), 'hex')
    return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload))
  }
}

export const directfy = new DirectfyClient()
export type { SendMessageParams, SendMessageResult, DirectfyWebhookPayload }
