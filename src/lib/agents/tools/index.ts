/**
 * Register every built-in tool once on module load. Importing this file
 * from the runtime / router is enough to make the tool registry populated.
 */

import { registerTool } from './registry'
import { sendMessageTool } from './send-message'
import {
  addTagTool,
  enrichLeadTool,
  movePipelineStageTool,
  removeTagTool,
  scheduleMeetingTool,
  updateLeadScoreTool,
} from './lead-tools'
import { classifyTextTool, searchKnowledgeTool } from './knowledge-tools'
import { createTrackingLinkTool } from './tracking-tools'

let registered = false

export function registerAllTools(): void {
  if (registered) return
  registered = true
  registerTool(sendMessageTool)
  registerTool(updateLeadScoreTool)
  registerTool(movePipelineStageTool)
  registerTool(scheduleMeetingTool)
  registerTool(addTagTool)
  registerTool(removeTagTool)
  registerTool(enrichLeadTool)
  registerTool(searchKnowledgeTool)
  registerTool(classifyTextTool)
  registerTool(createTrackingLinkTool)
}

// Auto-register on load.
registerAllTools()

export { getTool, listTools, getToolsForAgent, type ToolContext, type ToolResult, type ToolDefinition } from './registry'
