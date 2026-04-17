import Anthropic from '@anthropic-ai/sdk'

/**
 * @deprecated Use the LLM Gateway instead: `import { llm } from '@/lib/llm'`.
 *
 * The Gateway routes every request through `llm_routes`, records telemetry
 * (latency, tokens, cost, schema validity), and falls back to a secondary
 * model on errors — features this raw factory doesn't offer.
 *
 * Kept only so the agentic loop in `src/agents/prospecting-agent.ts` can
 * still instantiate Anthropic directly for tool_use parity (see comment at
 * the top of that file). Phase 4 removes the last direct consumer.
 */
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY não está configurado no .env.local')
    }
    _client = new Anthropic({ apiKey })
  }
  return _client
}
