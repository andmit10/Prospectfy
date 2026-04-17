/**
 * Public surface of the LLM Gateway. Everything outside `src/lib/llm/`
 * imports from `@/lib/llm`, not from individual files.
 */

export { llm, type Llm, type GatewayAttribution } from './gateway'
export { runTask, runEmbed, type RunTaskInput, type RunTaskResult } from './router'
export type {
  LlmMessage,
  LlmTask,
  LlmToolSchema,
  LlmModel,
  LlmRoute,
  LlmTier,
  LlmProviderId,
} from './types'
