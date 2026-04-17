import Anthropic from '@anthropic-ai/sdk'
import type { LlmCallRequest, LlmProvider, LlmProviderResult, LlmModel } from '../types'

/**
 * Anthropic provider — the only provider that keeps tool_use parity with
 * our agent loop today. Also serves as the reliable fallback for every
 * task when local Qwen is slow/unhealthy.
 */

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.AI_SERVICE_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set — required when Anthropic is in the routing table'
    )
  }
  client = new Anthropic({ apiKey })
  return client
}

function splitSystem(messages: LlmCallRequest['messages']): {
  system: string | undefined
  rest: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string }>
} {
  // Anthropic takes system at the top level, not inline.
  const systemParts: string[] = []
  const rest: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string }> = []
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
    } else if (m.role === 'tool') {
      rest.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id,
        name: m.name,
      })
    } else {
      rest.push({ role: m.role, content: m.content })
    }
  }
  return { system: systemParts.join('\n\n') || undefined, rest }
}

function roleToAnthropic(
  msg: { role: 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string }
): { role: 'user' | 'assistant'; content: unknown } {
  if (msg.role === 'tool') {
    // tool_use results come back in a user turn with type 'tool_result'.
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        },
      ],
    }
  }
  return { role: msg.role, content: msg.content }
}

function computeCost(model: LlmModel, tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1000) * model.cost_per_1k_in + (tokensOut / 1000) * model.cost_per_1k_out
}

async function call(req: LlmCallRequest): Promise<LlmProviderResult> {
  const started = Date.now()
  try {
    const { system, rest } = splitSystem(req.messages)
    const anthropicMessages = rest.map(roleToAnthropic) as Anthropic.MessageParam[]

    const anthropic = getClient()
    const message = await anthropic.messages.create(
      {
        model: req.model.model_handle,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        messages: anthropicMessages,
        ...(system ? { system } : {}),
        ...(req.tools && req.tools.length > 0
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
      },
      { signal: req.signal as AbortSignal | undefined }
    )

    // Flatten textual content + tool_use blocks.
    let text = ''
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
    for (const block of message.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        })
      }
    }

    const tokensIn = message.usage?.input_tokens ?? 0
    const tokensOut = message.usage?.output_tokens ?? 0

    return {
      ok: true,
      response: {
        content: text,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
        toolCalls,
        schemaValid: null,
        modelId: req.model.id,
        costUsd: computeCost(req.model, tokensIn, tokensOut),
        metadata: { stop_reason: message.stop_reason },
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Rate limits / 5xx are retryable; auth / schema errors are not.
    const retryable = /\b(429|5\d\d|timeout|ECONNRESET|network|overloaded)\b/i.test(msg)
    return { ok: false, error: msg, retryable }
  }
}

export const anthropicProvider: LlmProvider = {
  id: 'anthropic',
  call,
}
