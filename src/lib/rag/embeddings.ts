import { runEmbed } from '@/lib/llm/router'

/**
 * Thin wrapper over the LLM Gateway's embed route. Keeps the RAG pipeline
 * decoupled from provider specifics — `runEmbed` already handles fallback
 * between BGE-M3 (Ollama) and OpenAI text-embedding-3-small.
 *
 * Dimension expectation: 1024. Enforced by the `rag_chunks.embedding` column
 * type. If `runEmbed` returns anything else, we throw loudly — a silent
 * dimension mismatch corrupts the index.
 */

const EXPECTED_DIM = 1024

export async function embedText(text: string): Promise<{ embedding: number[]; modelId: string; tokens: number }> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Cannot embed empty text')
  }
  const result = await runEmbed(trimmed)
  if (!Array.isArray(result.embedding) || result.embedding.length !== EXPECTED_DIM) {
    throw new Error(
      `Embedding dim mismatch: got ${result.embedding?.length ?? 0}, expected ${EXPECTED_DIM}. ` +
        `Check llm_models rows for embedding tier — they must output ${EXPECTED_DIM} dims ` +
        `(use BGE-M3 native or OpenAI 3-small truncated via dimensions=${EXPECTED_DIM}).`
    )
  }
  return { embedding: result.embedding, modelId: result.model, tokens: result.tokens }
}

/**
 * Batched variant — embeds an array of chunks. Sequential for now (the
 * providers we support don't have meaningful batch APIs at the HTTP level),
 * but the interface is batch-friendly so we can parallelize later.
 */
export async function embedChunks(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<{ embeddings: number[][]; tokensTotal: number; modelId: string }> {
  const embeddings: number[][] = []
  let tokensTotal = 0
  let modelId = ''

  for (let i = 0; i < texts.length; i++) {
    const { embedding, modelId: m, tokens } = await embedText(texts[i])
    embeddings.push(embedding)
    tokensTotal += tokens
    if (!modelId) modelId = m
    onProgress?.(i + 1, texts.length)
  }

  return { embeddings, tokensTotal, modelId }
}
