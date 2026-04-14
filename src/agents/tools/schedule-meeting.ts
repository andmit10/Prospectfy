import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import type { SupabaseClient } from '@supabase/supabase-js'

export const scheduleMeetingSchema: Tool = {
  name: 'schedule_meeting',
  description:
    'Enviar link de agendamento quando o lead demonstra interesse em reunião',
  input_schema: {
    type: 'object' as const,
    properties: {
      lead_id: { type: 'string', description: 'UUID do lead' },
      calendly_url: {
        type: 'string',
        description: 'URL do Calendly para agendamento',
      },
    },
    required: ['lead_id', 'calendly_url'],
  },
}

export interface ScheduleMeetingInput {
  lead_id: string
  calendly_url: string
}

export async function executeScheduleMeeting(
  input: ScheduleMeetingInput,
  context: {
    supabase: SupabaseClient
    apiKey: string
    phone: string
    campaignId: string
    stepId: string
  }
) {
  const message = `Que ótimo! Aqui está o link para agendarmos nossa conversa: ${input.calendly_url}`

  const { directfy } = await import('@/server/services/directfy')
  const result = await directfy.withKey(context.apiKey).sendMessage({
    phone: context.phone,
    message,
    lead_id: input.lead_id,
  })

  await context.supabase.from('interactions').insert({
    lead_id: input.lead_id,
    campaign_id: context.campaignId,
    step_id: context.stepId,
    canal: 'whatsapp',
    tipo: 'enviado',
    mensagem_enviada: message,
    metadata: { message_id: result.message_id, type: 'meeting_link' },
  })

  // Move to 'reuniao' stage
  await context.supabase
    .from('leads')
    .update({ status_pipeline: 'reuniao', updated_at: new Date().toISOString() })
    .eq('id', input.lead_id)

  return { ok: true, message_id: result.message_id }
}
