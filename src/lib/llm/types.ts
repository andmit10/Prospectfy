/**
 * Shared types for the LLM Gateway. Every call site talks to
 * `gateway.ts`; providers implement the `LlmProvider` interface.
 */

export type LlmTask =
  | 'chat'
  | 'extract'
  | 'sequence'
  | 'classify'
  | 'agent_loop'
  | 'lead_gen'
  | 'embed'

export type LlmTier = 'fast' | 'balanced' | 'alt_balanced' | 'premium' | 'embedding'

export type LlmProviderId = 'ollama' | 'vllm' | 'anthropic' | 'openai'

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool'; content: string; tool_call_id: string; name: string }

export type LlmToolSchema = {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/**
 * Snapshot of an `llm_models` row held in memory by the registry.
 */
export type LlmModel = {
  id: string
  provider: LlmProviderId
  display_name: string
  endpoint: string | null
  model_handle: string
  context_window: number
  max_output_tokens: number
  cost_per_1k_in: number
  cost_per_1k_out: number
  tier: LlmTier
  supports_tool_use: boolean
  supports_json_schema: boolean
  enabled: boolean
}

/**
 * Snapshot of an `llm_routes` row.
 */
export type LlmRoute = {
  task: LlmTask
  primary_model_id: string
  fallback_model_id: string | null
  schema_name: string | null
  temperature: number
  max_tokens: number
}

/**
 * Everything a provider needs to run one call. The gateway builds this
 * from the caller's request + the route + the resolved model.
 */
export type LlmCallRequest = {
  task: LlmTask
  model: LlmModel
  messages: LlmMessage[]
  temperature: number
  maxTokens: number
  /** Optional JSON Schema the provider should constrain output to */
  jsonSchema?: Record<string, unknown> | null
  /** Optional tools exposed to the model (only agent_loop today) */
  tools?: LlmToolSchema[]
  /** Correlation id so primary + fallback telemetry rows share a trace */
  requestId: string
  /** Abort controller to stop slow calls before fallback kicks in */
  signal?: AbortSignal
}

/**
 * What providers return to the router. Unified across Anthropic / Ollama /
 * vLLM so callers don't branch on provider.
 */
export type LlmCallResponse = {
  content: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  /** Raw tool_use blocks when agent_loop; [] otherwise */
  toolCalls: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  /** Whether content was valid JSON against the schema when schema !== null */
  schemaValid: boolean | null
  /** Model handle that actually served the request */
  modelId: string
  /** Cost in USD computed from model pricing × token usage */
  costUsd: number
  /** Extra provider-specific payload (for debugging) */
  metadata?: Record<string, unknown>
}

/**
 * Contract every provider adapter implements. Returning a typed error
 * (not throwing) keeps the router's fallback path decisive.
 */
export type LlmProviderResult =
  | { ok: true; response: LlmCallResponse }
  | { ok: false; error: string; retryable: boolean }

export type LlmProvider = {
  id: LlmProviderId
  call(req: LlmCallRequest): Promise<LlmProviderResult>
  embed?(text: string, model: LlmModel): Promise<{ embedding: number[]; tokens: number } | null>
}

/**
 * Telemetry row queued after each call (primary and fallback both log).
 * Consumed by the BullMQ `llm-telemetry` queue.
 */
export type LlmTelemetryPayload = {
  orgId: string | null
  userId: string | null
  agentId: string | null
  task: LlmTask
  modelId: string
  requestId: string
  latencyMs: number
  tokensIn: number
  tokensOut: number
  schemaValid: boolean | null
  fallbackUsed: boolean
  fallbackReason: string | null
  error: string | null
  costUsd: number
  metadata?: Record<string, unknown>
}
