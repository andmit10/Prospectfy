/**
 * JSON Schema registry for task-structured LLM outputs.
 * Keyed by `llm_routes.schema_name` (nullable — tasks without a schema are
 * unconstrained text responses).
 *
 * Schemas are defined as plain JS objects so the TS compiler can still catch
 * typos in references. At runtime they're compiled by ajv once on first use.
 */

// ---------------------------------------------------------------------------
// classify-intent — for response classification in auto-progression.
// ---------------------------------------------------------------------------
export const classifyIntentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: ['positive', 'negative', 'neutral', 'question', 'unsubscribe', 'schedule_request'],
      description: 'Classified intent from the lead response',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    summary: {
      type: 'string',
      maxLength: 200,
      description: 'One-sentence summary of what the lead said',
    },
  },
  required: ['intent', 'confidence', 'summary'],
} as const

// ---------------------------------------------------------------------------
// sequence-step — message generation for a single cadence step.
// ---------------------------------------------------------------------------
export const sequenceStepSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: {
      type: 'string',
      minLength: 20,
      maxLength: 1000,
      description: 'Personalized outbound message',
    },
    reasoning: {
      type: 'string',
      maxLength: 300,
      description: 'One-paragraph rationale for the message choices',
    },
    tone: {
      type: 'string',
      enum: ['direto', 'consultivo', 'casual', 'urgente'],
    },
    call_to_action: { type: 'string', maxLength: 100 },
  },
  required: ['message', 'reasoning', 'tone', 'call_to_action'],
} as const

// ---------------------------------------------------------------------------
// extract-generic — free-form JSON extract. Schema varies per call site and
// is provided dynamically; this placeholder is here only so `schema_name`
// in llm_routes can point at *something* non-null.
// ---------------------------------------------------------------------------
export const extractGenericSchema = {
  type: 'object',
  additionalProperties: true,
} as const

// ---------------------------------------------------------------------------
// generate-leads — batch of leads. Keep numeric constraints loose so Qwen's
// fallback to Claude doesn't get rejected on a single out-of-range score.
// ---------------------------------------------------------------------------
export const generateLeadsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    leads: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          empresa_nome: { type: 'string', minLength: 1 },
          decisor_nome: { type: 'string', minLength: 1 },
          decisor_cargo: { type: 'string' },
          segmento: { type: 'string' },
          cidade: { type: 'string' },
          estado: { type: 'string' },
          email: { type: 'string' },
          whatsapp: { type: 'string', minLength: 10 },
          telefone: { type: 'string' },
          linkedin_url: { type: 'string' },
          cnpj: { type: 'string' },
          lead_score: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['empresa_nome', 'decisor_nome', 'whatsapp'],
      },
    },
  },
  required: ['leads'],
} as const

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const SCHEMA_REGISTRY: Record<string, Record<string, unknown>> = {
  'classify-intent': classifyIntentSchema as unknown as Record<string, unknown>,
  'sequence-step': sequenceStepSchema as unknown as Record<string, unknown>,
  'extract-generic': extractGenericSchema as unknown as Record<string, unknown>,
  'generate-leads': generateLeadsSchema as unknown as Record<string, unknown>,
}

export function getSchema(name: string | null | undefined): Record<string, unknown> | null {
  if (!name) return null
  return SCHEMA_REGISTRY[name] ?? null
}
