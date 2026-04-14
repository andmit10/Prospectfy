import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import { directfy } from '@/server/services/directfy'
import type { SupabaseClient } from '@supabase/supabase-js'

export const sendWhatsappSchema: Tool = {
  name: 'send_whatsapp',
  description: 'Enviar mensagem WhatsApp via Directfy para o lead',
  input_schema: {
    type: 'object' as const,
    properties: {
      phone: {
        type: 'string',
        description: 'Número WhatsApp com DDI (ex: 5531999999999)',
      },
      message: {
        type: 'string',
        description: 'Mensagem personalizada a enviar',
      },
      lead_id: {
        type: 'string',
        description: 'UUID do lead',
      },
    },
    required: ['phone', 'message', 'lead_id'],
  },
}

export interface SendWhatsappInput {
  phone: string
  message: string
  lead_id: string
}

export async function executeSendWhatsapp(
  input: SendWhatsappInput,
  context: { apiKey: string; supabase: SupabaseClient; campaignId: string; stepId: string }
) {
  const result = await directfy.withKey(context.apiKey).sendMessage({
    phone: input.phone,
    message: input.message,
    lead_id: input.lead_id,
  })

  // Record interaction
  await context.supabase.from('interactions').insert({
    lead_id: input.lead_id,
    campaign_id: context.campaignId,
    step_id: context.stepId,
    canal: 'whatsapp',
    tipo: 'enviado',
    mensagem_enviada: input.message,
    metadata: { message_id: result.message_id, directfy_status: result.status },
  })

  // Move lead to 'contatado' if still 'novo'
  await context.supabase
    .from('leads')
    .update({ status_pipeline: 'contatado', updated_at: new Date().toISOString() })
    .eq('id', input.lead_id)
    .eq('status_pipeline', 'novo')

  return { ok: true, message_id: result.message_id }
}
