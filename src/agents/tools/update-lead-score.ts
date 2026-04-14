import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import type { SupabaseClient } from '@supabase/supabase-js'

export const updateLeadScoreSchema: Tool = {
  name: 'update_lead_score',
  description: 'Atualizar score do lead baseado em interação recente',
  input_schema: {
    type: 'object' as const,
    properties: {
      lead_id: { type: 'string', description: 'UUID do lead' },
      points: {
        type: 'integer',
        description: 'Pontos a adicionar (positivo) ou remover (negativo)',
      },
      reason: { type: 'string', description: 'Motivo da atualização de score' },
    },
    required: ['lead_id', 'points', 'reason'],
  },
}

export interface UpdateLeadScoreInput {
  lead_id: string
  points: number
  reason: string
}

export async function executeUpdateLeadScore(
  input: UpdateLeadScoreInput,
  context: { supabase: SupabaseClient }
) {
  const { error } = await context.supabase.rpc('update_lead_score', {
    p_lead_id: input.lead_id,
    p_points: input.points,
    p_reason: input.reason,
  })

  if (error) throw error
  return { ok: true, points_added: input.points, reason: input.reason }
}
