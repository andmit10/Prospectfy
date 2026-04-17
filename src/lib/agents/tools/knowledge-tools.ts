import { retrieveAsWorker } from '@/lib/rag'
import { llm } from '@/lib/llm'
import type { ToolDefinition } from './registry'

/**
 * Knowledge tools — safe entry points the agent can use to look things up
 * in the org's RAG or to classify free text.
 *
 * `search_knowledge` enforces the agent's KB whitelist: even if the LLM
 * hallucinates a kb_id not bound to this agent, it gets rejected.
 */

export const searchKnowledgeTool: ToolDefinition = {
  name: 'search_knowledge',
  description:
    'Busca contexto factual nas bases de conhecimento vinculadas ao agente (ICP, playbooks, catálogo, objeções).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', minLength: 3, maxLength: 500 },
      top_k: { type: 'integer', minimum: 1, maximum: 10, default: 6 },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    const query = String(args.query ?? '').trim()
    if (!query) return { ok: false, error: 'query vazia' }
    if (ctx.allowedKbIds.length === 0) {
      return {
        ok: true,
        data: { hits: [], contextText: '', note: 'agente sem KB vinculada' },
      }
    }

    try {
      const result = await retrieveAsWorker({
        orgId: ctx.orgId,
        kbIds: ctx.allowedKbIds,
        query,
        topK: Math.min(Number(args.top_k ?? 6), 10),
      })

      return {
        ok: true,
        data: {
          // contextText is already wrapped in the prompt-injection-safe fence.
          contextText: result.contextText,
          hits: result.hits.map((h) => ({
            kbId: h.kbId,
            documentId: h.documentId,
            similarity: Number(h.similarity.toFixed(3)),
            sourceHint: h.sourceHint,
          })),
          tokensUsed: result.tokensUsed,
        },
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

/**
 * classify_text — runs the classify LLM task (routes to Qwen3 local / Claude
 * Haiku). Returns intent + confidence + 1-line summary.
 */
export const classifyTextTool: ToolDefinition = {
  name: 'classify_text',
  description:
    'Classifica uma resposta de lead em uma das intenções (positiva/negativa/neutra/pergunta/desinscrição/pedido_de_agenda).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 2000 },
    },
    required: ['text'],
  },
  async execute(args, ctx) {
    const text = String(args.text ?? '').trim()
    if (!text) return { ok: false, error: 'text vazio' }

    try {
      const result = await llm.classify<{
        intent: string
        confidence: number
        summary: string
      }>({
        user: `Classifique a mensagem abaixo. Responda JSON com {intent, confidence (0-1), summary (<200 chars)}.
Mensagem:
${text}`,
        orgId: ctx.orgId,
      })
      return {
        ok: true,
        data: result.data,
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
