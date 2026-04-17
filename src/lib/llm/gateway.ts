import { runEmbed, runTask } from './router'
import type {
  LlmMessage,
  LlmTask,
  LlmToolSchema,
} from './types'

/**
 * Public façade over the router. Call sites import from `@/lib/llm` and
 * use `llm.chat`, `llm.extract`, `llm.classify`, `llm.sequence`,
 * `llm.agentLoop`, `llm.leadGen`, `llm.embed` — task-level intent, no model
 * knobs. Anything model/schema specific lives in `registry.ts` / `router.ts`.
 */

export type GatewayAttribution = {
  orgId?: string | null
  userId?: string | null
  agentId?: string | null
}

type CommonOpts = GatewayAttribution & {
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * Helper to prepend a system prompt when provided. Keeps call-site code terse.
 */
function buildMessages({
  system,
  user,
  history,
}: {
  system?: string
  user: string
  history?: LlmMessage[]
}): LlmMessage[] {
  const msgs: LlmMessage[] = []
  if (system) msgs.push({ role: 'system', content: system })
  if (history) msgs.push(...history)
  msgs.push({ role: 'user', content: user })
  return msgs
}

async function run(task: LlmTask, opts: {
  messages: LlmMessage[]
  schema?: Record<string, unknown>
  tools?: LlmToolSchema[]
} & CommonOpts) {
  return runTask({
    task,
    messages: opts.messages,
    overrideSchema: opts.schema,
    tools: opts.tools,
    orgId: opts.orgId ?? null,
    userId: opts.userId ?? null,
    agentId: opts.agentId ?? null,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  })
}

export const llm = {
  /**
   * Free-form chat — no schema constraint. Ideal for the agent's greeting
   * or responses where we want tone flexibility.
   */
  async chat(opts: {
    system?: string
    user: string
    history?: LlmMessage[]
  } & CommonOpts) {
    return run('chat', {
      ...opts,
      messages: buildMessages({ system: opts.system, user: opts.user, history: opts.history }),
    })
  },

  /**
   * Structured extraction — caller provides a JSON Schema. Used for
   * pulling structured data (contact info, CNPJ details, intents) out of
   * free-form text.
   */
  async extract<T = unknown>(opts: {
    system?: string
    user: string
    schema: Record<string, unknown>
    history?: LlmMessage[]
  } & CommonOpts): Promise<{ data: T; fallbackUsed: boolean; modelId: string; requestId: string }> {
    const result = await run('extract', {
      ...opts,
      schema: opts.schema,
      messages: buildMessages({ system: opts.system, user: opts.user, history: opts.history }),
    })
    return {
      data: result.parsed as T,
      fallbackUsed: result.fallbackUsed,
      modelId: result.modelId,
      requestId: result.requestId,
    }
  },

  /**
   * Generate one cadence step message. Uses the `sequence-step` schema.
   */
  async sequence(opts: {
    system: string
    user: string
    history?: LlmMessage[]
  } & CommonOpts) {
    return run('sequence', {
      ...opts,
      messages: buildMessages({ system: opts.system, user: opts.user, history: opts.history }),
    })
  },

  /**
   * Short classification (intent, sentiment, etc). Uses `classify-intent`
   * schema by default.
   */
  async classify<T = { intent: string; confidence: number; summary: string }>(opts: {
    system?: string
    user: string
    schema?: Record<string, unknown>
  } & CommonOpts): Promise<{ data: T; fallbackUsed: boolean; modelId: string; requestId: string }> {
    const result = await run('classify', {
      ...opts,
      schema: opts.schema,
      messages: buildMessages({ system: opts.system, user: opts.user }),
    })
    return {
      data: result.parsed as T,
      fallbackUsed: result.fallbackUsed,
      modelId: result.modelId,
      requestId: result.requestId,
    }
  },

  /**
   * Run the agentic tool_use loop. Returns the raw response so callers
   * (the agent runtime) can read tool_calls and drive the loop.
   */
  async agentLoop(opts: {
    messages: LlmMessage[]
    tools: LlmToolSchema[]
  } & CommonOpts) {
    return runTask({
      task: 'agent_loop',
      messages: opts.messages,
      tools: opts.tools,
      orgId: opts.orgId ?? null,
      userId: opts.userId ?? null,
      agentId: opts.agentId ?? null,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    })
  },

  /**
   * Batch lead generation. Uses the `generate-leads` schema.
   */
  async leadGen(opts: {
    system?: string
    user: string
  } & CommonOpts) {
    return run('lead_gen', {
      ...opts,
      messages: buildMessages({ system: opts.system, user: opts.user }),
    })
  },

  /**
   * Embed a single text chunk. Used by the RAG ingest pipeline.
   */
  async embed(text: string) {
    return runEmbed(text)
  },
}

export type Llm = typeof llm
