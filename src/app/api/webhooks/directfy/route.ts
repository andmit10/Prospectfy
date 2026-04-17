import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientEnv } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'
import { childLogger } from '@/lib/logger'
import type { DirectfyWebhookPayload } from '@/server/services/directfy'

const log = childLogger('webhook:directfy')

// Use service role to bypass RLS for webhook writes
function getServiceClient() {
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY
  )
}

const STATUS_MAP = {
  delivered: 'entregue',
  read: 'lido',
  replied: 'respondido',
} as const

export async function POST(request: Request) {
  const body = await request.text()

  // Signature is REQUIRED in all environments. Misconfiguration fails closed (503)
  // so a silently unset secret cannot be used to spoof lead status updates.
  const webhookSecret = serverEnv.DIRECTFY_WEBHOOK_SECRET
  if (!webhookSecret) {
    log.error('DIRECTFY_WEBHOOK_SECRET not configured — refusing webhook')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 }
    )
  }
  const signature = request.headers.get('x-directfy-signature') ?? ''
  const { directfy } = await import('@/server/services/directfy')
  const valid = await directfy.verifyWebhookSignature(body, signature, webhookSecret)
  if (!valid) {
    log.warn('invalid webhook signature', { signaturePresent: signature.length > 0 })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: DirectfyWebhookPayload
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tipo = STATUS_MAP[payload.status]
  if (!tipo) {
    return NextResponse.json({ ok: true }) // ignore unknown status
  }

  const supabase = getServiceClient()

  // Find the original 'enviado' interaction by message_id stored in metadata
  const { data: original } = await supabase
    .from('interactions')
    .select('id, lead_id, campaign_id, step_id')
    .eq('metadata->>message_id', payload.message_id)
    .single()

  if (!original) {
    return NextResponse.json({ ok: true }) // already processed or unknown
  }

  // Insert status update interaction
  await supabase.from('interactions').insert({
    lead_id: original.lead_id,
    campaign_id: original.campaign_id,
    step_id: original.step_id,
    canal: 'whatsapp',
    tipo,
    resposta_lead: payload.status === 'replied' ? payload.reply_text : null,
    metadata: { message_id: payload.message_id, directfy_timestamp: payload.timestamp },
  })

  // If lead replied → pause campaign for this lead by cancelling pending queue items
  if (payload.status === 'replied') {
    await supabase
      .from('agent_queue')
      .update({ status: 'cancelled' })
      .eq('lead_id', original.lead_id)
      .eq('status', 'pending')

    // Move lead to 'respondeu'
    await supabase
      .from('leads')
      .update({ status_pipeline: 'respondeu', updated_at: new Date().toISOString() })
      .eq('id', original.lead_id)
      .eq('status_pipeline', 'contatado') // only if still in 'contatado'
  }

  return NextResponse.json({ ok: true })
}
