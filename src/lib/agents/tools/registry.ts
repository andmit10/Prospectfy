import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Agent Tool Registry — contract between the runtime and each tool
 * implementation.
 *
 * Every tool receives:
 *   - `args`: the typed input object the LLM produced (validated via Zod)
 *   - `ctx`: execution context (orgId, agentId, leadId, serviceClient, vars)
 *
 * Tools:
 *   - NEVER throw for expected errors — they return `{ ok: false, error }`.
 *     This way one bad tool call doesn't crash the whole agent run.
 *   - NEVER call across orgs. The service client has unrestricted access,
 *     so every tool MUST filter by `ctx.orgId`.
 *   - Return `data` under 4KB when possible — large payloads inflate the
 *     `agent_runs.tool_calls` column.
 */

export type ToolContext = {
  orgId: string
  agentId: string
  runId: string
  leadId: string | null
  /** Agent's allowlisted channels — tools must refuse out-of-list sends. */
  allowedChannels: string[]
  /** Agent's bound KB ids — search_knowledge enforces these. */
  allowedKbIds: string[]
  /** Service-role Supabase client (bypasses RLS — tools are trusted code). */
  supabase: SupabaseClient
  /** Captured variables from prior steps (LLM outputs, tool results). */
  vars: Record<string, unknown>
  /** Human-readable company name, used in prompts / link signatures. */
  companyName: string
}

export type ToolResult =
  | { ok: true; data: unknown; costUsd?: number; tokens?: number }
  | { ok: false; error: string }

export type ToolDefinition = {
  name: string
  description: string
  /** JSON Schema exposed to the LLM when the runtime registers the tool. */
  inputSchema: Record<string, unknown>
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

const tools = new Map<string, ToolDefinition>()

export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool)
}

export function getTool(name: string): ToolDefinition | null {
  return tools.get(name) ?? null
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values())
}

/**
 * Get the tool schema subset the LLM runtime should expose for a given
 * agent. Filters by the agent's `tools` whitelist so the LLM can never
 * call something outside the definition.
 */
export function getToolsForAgent(whitelist: string[]): ToolDefinition[] {
  if (!whitelist.length) return []
  return whitelist.map((n) => tools.get(n)).filter((t): t is ToolDefinition => !!t)
}
