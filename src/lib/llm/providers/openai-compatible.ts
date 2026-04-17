import type {
  LlmCallRequest,
  LlmModel,
  LlmProvider,
  LlmProviderId,
  LlmProviderResult,
} from '../types'

/**
 * OpenAI-compatible provider — shared implementation for Ollama and vLLM,
 * both of which expose the `/v1/chat/completions` and `/v1/embeddings`
 * endpoints. We parameterize the provider id so telemetry reflects the real
 * source (ollama vs vllm).
 *
 * This module never imports the OpenAI SDK — a hand-rolled fetch is enough
 * and keeps the bundle small. We only use chat/completions + embeddings.
 */

function computeCost(model: LlmModel, tokensIn: number, tokensOut: number): number {
  // Self-hosted models price at 0 in the catalog; OpenAI-hosted entries set
  // real prices. Either way the same formula holds.
  return (tokensIn / 1000) * model.cost_per_1k_in + (tokensOut / 1000) * model.cost_per_1k_out
}

function toOpenAiMessages(messages: LlmCallRequest['messages']): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.tool_call_id,
        name: m.name,
      }
    }
    return { role: m.role, content: m.content }
  })
}

function makeCall(providerId: LlmProviderId, apiKeyEnv?: string) {
  return async function call(req: LlmCallRequest): Promise<LlmProviderResult> {
    const started = Date.now()
    const endpoint = req.model.endpoint
    if (!endpoint) {
      return {
        ok: false,
        error: `Model ${req.model.id} has no endpoint configured`,
        retryable: false,
      }
    }

    // API key: Ollama uses a dummy "ollama" token; vLLM usually open, but
    // allow an env var when deployed behind an auth gateway. OpenAI needs a
    // real key (apiKeyEnv = 'OPENAI_API_KEY').
    const apiKey = apiKeyEnv
      ? process.env[apiKeyEnv] ?? ''
      : providerId === 'ollama'
        ? 'ollama'
        : process.env.LLM_LOCAL_API_KEY ?? ''

    const body: Record<string, unknown> = {
      model: req.model.model_handle,
      messages: toOpenAiMessages(req.messages),
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    }

    if (req.jsonSchema) {
      // Ollama accepts a structured `format`; OpenAI / vLLM use
      // `response_format: { type: "json_schema", ... }`. Send both — unknown
      // fields are ignored by the accepting server.
      body.format = req.jsonSchema
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.task,
          strict: true,
          schema: req.jsonSchema,
        },
      }
    }

    if (req.tools && req.tools.length > 0 && req.model.supports_tool_use) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
      body.tool_choice = 'auto'
    }

    try {
      const res = await fetch(
        endpoint.replace(/\/$/, '') + '/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: req.signal,
        }
      )

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const retryable = res.status >= 500 || res.status === 429
        return {
          ok: false,
          error: `${providerId} ${res.status}: ${text.slice(0, 200)}`,
          retryable,
        }
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: Array<{
              id: string
              function: { name: string; arguments: string }
            }>
          }
        }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }

      const choice = json.choices?.[0]
      const content = choice?.message?.content ?? ''
      const toolCalls =
        (choice?.message?.tool_calls ?? []).map((tc) => {
          let parsedInput: Record<string, unknown> = {}
          try {
            parsedInput = JSON.parse(tc.function.arguments) as Record<string, unknown>
          } catch {
            // malformed args — pass through as raw
            parsedInput = { _raw: tc.function.arguments }
          }
          return {
            id: tc.id,
            name: tc.function.name,
            input: parsedInput,
          }
        })

      const tokensIn = json.usage?.prompt_tokens ?? 0
      const tokensOut = json.usage?.completion_tokens ?? 0

      return {
        ok: true,
        response: {
          content,
          tokensIn,
          tokensOut,
          latencyMs: Date.now() - started,
          toolCalls,
          schemaValid: null,
          modelId: req.model.id,
          costUsd: computeCost(req.model, tokensIn, tokensOut),
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const retryable = /\b(timeout|ECONNRESET|network|aborted|ECONNREFUSED)\b/i.test(msg)
      return { ok: false, error: msg, retryable }
    }
  }
}

async function embed(text: string, model: LlmModel): Promise<{ embedding: number[]; tokens: number } | null> {
  const endpoint = model.endpoint
  if (!endpoint) return null

  const apiKey =
    model.provider === 'ollama'
      ? 'ollama'
      : process.env.OPENAI_API_KEY ?? process.env.LLM_LOCAL_API_KEY ?? ''

  const res = await fetch(endpoint.replace(/\/$/, '') + '/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model.model_handle,
      input: text,
    }),
  })

  if (!res.ok) return null

  const json = (await res.json()) as {
    data?: Array<{ embedding: number[] }>
    usage?: { total_tokens?: number }
  }

  const embedding = json.data?.[0]?.embedding
  if (!embedding) return null

  return { embedding, tokens: json.usage?.total_tokens ?? 0 }
}

export const ollamaProvider: LlmProvider = {
  id: 'ollama',
  call: makeCall('ollama'),
  embed,
}

export const vllmProvider: LlmProvider = {
  id: 'vllm',
  call: makeCall('vllm'),
  embed,
}

export const openaiProvider: LlmProvider = {
  id: 'openai',
  call: makeCall('openai', 'OPENAI_API_KEY'),
  embed,
}
