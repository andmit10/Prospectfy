import { dispatch } from '@/lib/channels'
import { resolveMessageTemplate } from '@/lib/pipeline/tracking'
import type { ToolDefinition } from './registry'

/**
 * send_message — delivers a message via any whitelisted channel. Enforces
 * the agent's channel whitelist at the tool level (second gate after the
 * definition's `channels[]`).
 */
export const sendMessageTool: ToolDefinition = {
  name: 'send_message',
  description:
    'Envia uma mensagem ao lead pelo canal especificado (WhatsApp, email, LinkedIn, Instagram). Usa a integração padrão da organização para o canal.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      channel: {
        type: 'string',
        enum: ['whatsapp', 'email', 'linkedin', 'instagram', 'sms'],
      },
      content: { type: 'string', minLength: 1, maxLength: 4000 },
      subject: { type: 'string', maxLength: 200, description: 'Email only' },
      to: {
        type: 'string',
        description:
          'Optional override — defaults to the lead\'s channel-appropriate identifier (whatsapp/email/linkedin_url)',
      },
    },
    required: ['channel', 'content'],
  },
  async execute(args, ctx) {
    const channel = args.channel as 'whatsapp' | 'email' | 'linkedin' | 'instagram' | 'sms'
    const content = (args.content as string | undefined) ?? ''
    const subject = args.subject as string | undefined
    const toOverride = args.to as string | undefined

    if (!ctx.allowedChannels.includes(channel)) {
      return {
        ok: false,
        error: `Canal "${channel}" não está no whitelist do agente (${ctx.allowedChannels.join(', ') || 'nenhum'})`,
      }
    }

    // Resolve recipient from lead row when not overridden.
    let recipient = toOverride
    if (!recipient && ctx.leadId) {
      const { data: lead } = await ctx.supabase
        .from('leads')
        .select('whatsapp, email, linkedin_url, telefone')
        .eq('id', ctx.leadId)
        .eq('organization_id', ctx.orgId)
        .maybeSingle()
      if (lead) {
        switch (channel) {
          case 'whatsapp':
            recipient = lead.whatsapp ?? undefined
            break
          case 'sms':
            recipient = lead.telefone ?? lead.whatsapp ?? undefined
            break
          case 'email':
            recipient = lead.email ?? undefined
            break
          case 'linkedin':
            recipient = lead.linkedin_url ?? undefined
            break
          case 'instagram':
            recipient = undefined
            break
        }
      }
    }

    if (!recipient) {
      return { ok: false, error: `Lead sem endereço para canal ${channel}` }
    }

    // Resolve `{link:URL}` template tokens into tracked redirects scoped to
    // this lead + agent run. The result is persisted by the channel dispatcher
    // so every outbound record shows the FINAL text the lead received.
    const resolvedContent = await resolveMessageTemplate({
      content,
      organizationId: ctx.orgId,
      leadId: ctx.leadId,
      agentRunId: ctx.runId,
    })

    const outcome = await dispatch({
      orgId: ctx.orgId,
      channel,
      leadId: ctx.leadId,
      payload: {
        to: recipient,
        content: resolvedContent,
        subject,
      },
    })

    if (!outcome.ok) {
      return { ok: false, error: outcome.error ?? 'falha no envio' }
    }
    return {
      ok: true,
      data: {
        messageId: outcome.messageId,
        externalMessageId: outcome.externalMessageId,
        integrationId: outcome.integrationId,
      },
    }
  },
}
