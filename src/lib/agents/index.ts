/**
 * Public surface of the Agents runtime.
 */

export {
  AgentDefinitionSchema,
  AVAILABLE_TOOLS,
  AVAILABLE_CHANNELS,
  buildSystemPromptFromDefinition,
  compileFromDescription,
  type AgentDefinition,
  type AgentStep,
  type CompileResult,
} from './definition'

export { executeAgent, type ExecuteResult } from './executor'

export {
  getTool,
  listTools,
  getToolsForAgent,
  type ToolContext,
  type ToolResult,
  type ToolDefinition,
} from './tools'

export { buildRunContext, interpolate, resolvePath, type RunContext } from './context-builder'
