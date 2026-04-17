import Ajv, { type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

/**
 * Cached ajv validators. Compiling a schema is expensive (~ms), so we
 * memoize by schema identity and reuse across calls.
 */

const ajv = new Ajv({
  allErrors: false,
  strict: false,
  // Allow extra keywords in schema objects without throwing (e.g. `description`).
  keywords: [],
})
addFormats(ajv)

const compiledCache = new WeakMap<object, ValidateFunction>()

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const cached = compiledCache.get(schema)
  if (cached) return cached
  const fn = ajv.compile(schema)
  compiledCache.set(schema, fn)
  return fn
}

/**
 * Extract a JSON payload from raw LLM output — handles markdown code fences,
 * surrounding prose, and partial objects. Returns null when nothing parses.
 */
export function extractJson(raw: string): unknown {
  if (!raw) return null
  const trimmed = raw.trim()

  // 1. Pure JSON fast path.
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through
  }

  // 2. Fenced blocks: ```json { ... } ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1])
    } catch {
      // fall through
    }
  }

  // 3. First balanced object or array in the text.
  const firstBrace = trimmed.search(/[[{]/)
  if (firstBrace === -1) return null
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
  if (lastBrace <= firstBrace) return null
  const candidate = trimmed.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

export type ValidationResult =
  | { valid: true; data: unknown }
  | { valid: false; error: string; data: unknown | null }

/**
 * Validate raw LLM output against a JSON Schema. Runs `extractJson` first
 * so the caller can pass unfiltered content.
 */
export function validateAgainst(
  schema: Record<string, unknown> | null,
  raw: string
): ValidationResult {
  if (!schema) {
    const parsed = extractJson(raw)
    return { valid: true, data: parsed ?? raw }
  }

  const data = extractJson(raw)
  if (data === null) {
    return { valid: false, error: 'No JSON payload found in response', data: null }
  }

  const fn = getValidator(schema)
  const ok = fn(data)
  if (!ok) {
    const err =
      fn.errors?.[0]
        ? `${fn.errors[0].instancePath || '/'}: ${fn.errors[0].message ?? 'invalid'}`
        : 'schema validation failed'
    return { valid: false, error: err, data }
  }
  return { valid: true, data }
}
