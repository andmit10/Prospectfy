import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineStatus } from '@/types'

export const movePipelineStageSchema: Tool = {
  name: 'move_pipeline_stage',
  description: 'Mover lead para outro estágio do pipeline CRM',
  input_schema: {
    type: 'object' as const,
    properties: {
      lead_id: { type: 'string', description: 'UUID do lead' },
      new_status: {
        type: 'string',
        enum: ['novo', 'contatado', 'respondeu', 'reuniao', 'convertido', 'perdido'],
        description: 'Novo estágio do pipeline',
      },
    },
    required: ['lead_id', 'new_status'],
  },
}

export interface MovePipelineStageInput {
  lead_id: string
  new_status: PipelineStatus
}

export async function executeMovePipelineStage(
  input: MovePipelineStageInput,
  context: { supabase: SupabaseClient }
) {
  const { error } = await context.supabase
    .from('leads')
    .update({
      status_pipeline: input.new_status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.lead_id)

  if (error) throw error

  // Cancel pending queue items if lead is done
  if (input.new_status === 'convertido' || input.new_status === 'perdido') {
    await context.supabase
      .from('agent_queue')
      .update({ status: 'cancelled' })
      .eq('lead_id', input.lead_id)
      .eq('status', 'pending')
  }

  return { ok: true, new_status: input.new_status }
}
