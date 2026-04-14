import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'
import type { Lead, CadenciaStep, Interaction } from '@/types'

import { sendWhatsappSchema, executeSendWhatsapp } from './tools/send-whatsapp'
import { updateLeadScoreSchema, executeUpdateLeadScore } from './tools/update-lead-score'
import { movePipelineStageSchema, executeMovePipelineStage } from './tools/move-pipeline-stage'
import { scheduleMeetingSchema, executeScheduleMeeting } from './tools/schedule-meeting'

const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY })

const TOOLS = [
  sendWhatsappSchema,
  updateLeadScoreSchema,
  movePipelineStageSchema,
  scheduleMeetingSchema,
]

interface AgentContext {
  lead: Lead
  step: CadenciaStep
  recentInteractions: Interaction[]
  totalSteps: number
  directfyApiKey: string
  calendlyUrl: string
  companyName: string
  supabase: SupabaseClient
}

function buildSystemPrompt(ctx: AgentContext): string {
  return `Você é um SDR digital da ${ctx.companyName}. Seu objetivo é agendar reuniões de vendas.

Regras:
- Personalize cada mensagem com dados do lead
- Mantenha tom profissional mas casual (WhatsApp é informal no Brasil)
- Mensagens curtas: máximo 3 parágrafos
- Inclua uma pergunta ou CTA no final
- Se o lead já respondeu positivamente, envie link de agendamento via schedule_meeting
- Se o lead pediu para parar, respeite e use move_pipeline_stage com "perdido"
- Horários de envio: seg-sex, 8h-18h (horário de Brasília) — se fora do horário, adie
- Sempre use update_lead_score após enviar mensagem (+5 pontos por envio)
- Use update_lead_score com pontos negativos se lead ignorou steps anteriores

Contexto do lead:
Nome: ${ctx.lead.decisor_nome}
Cargo: ${ctx.lead.decisor_cargo ?? 'não informado'}
Empresa: ${ctx.lead.empresa_nome}
Segmento: ${ctx.lead.segmento ?? 'não informado'}
WhatsApp: ${ctx.lead.whatsapp}
Score atual: ${ctx.lead.lead_score}
Step atual: ${ctx.step.step_order} de ${ctx.totalSteps}
Template sugerido: ${ctx.step.mensagem_template}

Histórico de interações (mais recentes primeiro):
${
  ctx.recentInteractions.length === 0
    ? 'Nenhuma interação ainda.'
    : ctx.recentInteractions
        .map(
          (i) =>
            `[${new Date(i.created_at).toLocaleString('pt-BR')}] ${i.tipo}${i.resposta_lead ? ` — resposta: "${i.resposta_lead}"` : ''}`
        )
        .join('\n')
}`
}

function buildUserPrompt(ctx: AgentContext): string {
  return `Execute o step ${ctx.step.step_order} da cadência para o lead ${ctx.lead.decisor_nome} (${ctx.lead.empresa_nome}).

Use o template como base, mas personalize com os dados do lead.
Após enviar, atualize o score com update_lead_score (+5 pontos, motivo: "mensagem enviada step ${ctx.step.step_order}").

Lead ID: ${ctx.lead.id}
WhatsApp: ${ctx.lead.whatsapp}
Calendly (se necessário): ${ctx.calendlyUrl || 'não configurado'}`
}

export interface AgentRunResult {
  success: boolean
  toolsExecuted: string[]
  reasoning: string
  error?: string
}

export async function runProspectingAgent(ctx: AgentContext): Promise<AgentRunResult> {
  const toolsExecuted: string[] = []
  const reasoningParts: string[] = []

  const toolContext = {
    apiKey: ctx.directfyApiKey,
    supabase: ctx.supabase,
    campaignId: ctx.step.campaign_id,
    stepId: ctx.step.id,
    phone: ctx.lead.whatsapp,
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildUserPrompt(ctx) },
    ]

    // Agentic loop: keep going until no more tool_use blocks
    let continueLoop = true
    while (continueLoop) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: buildSystemPrompt(ctx),
        tools: TOOLS,
        messages,
      })

      // Collect text reasoning
      for (const block of response.content) {
        if (block.type === 'text') {
          reasoningParts.push(block.text)
        }
      }

      if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
        continueLoop = false
        break
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        toolsExecuted.push(block.name)
        let result: unknown

        try {
          switch (block.name) {
            case 'send_whatsapp':
              result = await executeSendWhatsapp(
                block.input as Parameters<typeof executeSendWhatsapp>[0],
                toolContext
              )
              break
            case 'update_lead_score':
              result = await executeUpdateLeadScore(
                block.input as Parameters<typeof executeUpdateLeadScore>[0],
                toolContext
              )
              break
            case 'move_pipeline_stage':
              result = await executeMovePipelineStage(
                block.input as Parameters<typeof executeMovePipelineStage>[0],
                toolContext
              )
              break
            case 'schedule_meeting':
              result = await executeScheduleMeeting(
                block.input as Parameters<typeof executeScheduleMeeting>[0],
                {
                  supabase: toolContext.supabase,
                  apiKey: toolContext.apiKey,
                  phone: toolContext.phone,
                  campaignId: toolContext.campaignId,
                  stepId: toolContext.stepId,
                }
              )
              break
            default:
              result = { error: `Unknown tool: ${block.name}` }
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }

      // Feed tool results back for next loop iteration
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
    }

    return {
      success: true,
      toolsExecuted,
      reasoning: reasoningParts.join('\n'),
    }
  } catch (err) {
    return {
      success: false,
      toolsExecuted,
      reasoning: reasoningParts.join('\n'),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
