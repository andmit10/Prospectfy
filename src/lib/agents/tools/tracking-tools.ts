import { createTrackingLink } from '@/lib/pipeline/tracking'
import type { ToolDefinition } from './registry'

/**
 * create_tracking_link — expose tracking-link generation as an explicit
 * tool so agents that reason about CTAs can request a URL-short pair to
 * embed in their own message construction.
 *
 * Most cases DON'T need this — `send_message` auto-resolves `{link:...}`
 * template tokens. Use this when the agent needs the raw URL to pass
 * through another tool (e.g. schedule_meeting with a personalized param).
 */
export const createTrackingLinkTool: ToolDefinition = {
  name: 'create_tracking_link',
  description:
    'Gera um link encurtado rastreável para uma URL de destino. Retorna o código + URL pública. Use apenas quando precisar do link explicitamente (a maioria dos casos usa o template {link:URL} no content).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      target_url: { type: 'string', format: 'uri', minLength: 8, maxLength: 2048 },
      label: { type: 'string', maxLength: 60 },
    },
    required: ['target_url'],
  },
  async execute(args, ctx) {
    const target = String(args.target_url ?? '').trim()
    if (!target) return { ok: false, error: 'target_url vazio' }

    try {
      const link = await createTrackingLink({
        organizationId: ctx.orgId,
        leadId: ctx.leadId,
        agentRunId: ctx.runId,
        targetUrl: target,
        label: (args.label as string | undefined) ?? null,
      })
      return {
        ok: true,
        data: {
          short_code: link.shortCode,
          public_url: link.publicUrl,
        },
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
