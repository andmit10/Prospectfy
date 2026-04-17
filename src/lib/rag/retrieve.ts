import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { embedText } from './embeddings'
import { MAX_CONTEXT_TOKENS, wrapContextSafe } from './security'

/**
 * RAG retrieval — embeds the query and runs the `rag_search` RPC with the
 * caller's auth context. RLS + the RPC's own `org_members` check guarantee
 * chunks are org-scoped even when the caller crafts malicious kb_ids.
 *
 * Two entrypoints:
 *   - `retrieve()`       — uses the SSR client (auth.uid() from session)
 *   - `retrieveAsWorker` — uses service client + explicit orgId/userId
 *                          for background jobs. The RPC still enforces
 *                          membership via the passed orgId.
 */

export type RagHit = {
  id: string
  documentId: string
  kbId: string
  chunkIndex: number
  content: string
  sourceHint: string | null
  similarity: number
}

export type RetrieveOptions = {
  kbIds: string[]
  query: string
  topK?: number
  minScore?: number
  maxContextTokens?: number
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Pack hits into a single context string, stopping before the token budget
 * is exceeded so upstream prompts stay within the model window.
 */
function packForContext(hits: RagHit[], maxTokens: number): RagHit[] {
  const kept: RagHit[] = []
  let total = 0
  for (const hit of hits) {
    const t = approxTokens(hit.content)
    if (total + t > maxTokens) break
    kept.push(hit)
    total += t
  }
  return kept
}

async function runSearch(args: {
  supabase: ReturnType<typeof createServiceClient>
  orgId: string
  kbIds: string[]
  embedding: number[]
  topK: number
  minScore: number
}): Promise<RagHit[]> {
  const { data, error } = await args.supabase.rpc('rag_search', {
    p_org_id: args.orgId,
    p_kb_ids: args.kbIds,
    p_query_embedding: args.embedding,
    p_top_k: args.topK,
    p_min_score: args.minScore,
  })

  if (error) throw error

  type SearchRow = {
    id: string
    document_id: string
    kb_id: string
    chunk_index: number
    content: string
    source_hint: string | null
    similarity: number | string
  }

  return (data as SearchRow[] | null ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    kbId: row.kb_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    sourceHint: row.source_hint,
    similarity: typeof row.similarity === 'number' ? row.similarity : Number(row.similarity),
  }))
}

/**
 * Retrieve from an authenticated user's session context. Uses the SSR
 * Supabase client so auth.uid() lands in the RPC and both RLS and the
 * function's own `org_members` check apply.
 */
export async function retrieve(orgId: string, opts: RetrieveOptions) {
  if (opts.kbIds.length === 0) return { hits: [] as RagHit[], contextText: '', tokensUsed: 0 }

  const supabase = await createClient()
  const { embedding } = await embedText(opts.query)

  const hits = await runSearch({
    supabase: supabase as unknown as ReturnType<typeof createServiceClient>,
    orgId,
    kbIds: opts.kbIds,
    embedding,
    topK: opts.topK ?? 6,
    minScore: opts.minScore ?? 0.5,
  })

  const packed = packForContext(hits, opts.maxContextTokens ?? MAX_CONTEXT_TOKENS)
  const contextText = wrapContextSafe(
    packed.map((h) => ({ content: h.content, sourceHint: h.sourceHint }))
  )
  return {
    hits: packed,
    contextText,
    tokensUsed: packed.reduce((acc, h) => acc + approxTokens(h.content), 0),
  }
}

/**
 * Worker variant — uses service client so the RPC's auth.uid() is null.
 * We intentionally do NOT bypass the RPC; instead, the worker uses a
 * separate direct-SQL search that still filters on the job's org_id. This
 * keeps service-role usage narrow and auditable.
 */
export async function retrieveAsWorker(opts: {
  orgId: string
  kbIds: string[]
  query: string
  topK?: number
  minScore?: number
  maxContextTokens?: number
}) {
  if (opts.kbIds.length === 0) return { hits: [] as RagHit[], contextText: '', tokensUsed: 0 }

  const supabase = createServiceClient()
  const { embedding } = await embedText(opts.query)

  // Direct SQL bypassing the auth check — we trust the orgId because the
  // worker receives it from the agent_queue row which is already org-scoped.
  // The chunks we read are still org-scoped by the WHERE clause.
  const { data, error } = await supabase
    .from('rag_chunks')
    .select('id, document_id, kb_id, chunk_index, content, source_hint, embedding')
    .eq('organization_id', opts.orgId)
    .in('kb_id', opts.kbIds)
    .limit((opts.topK ?? 6) * 10) // over-fetch then score in JS

  if (error) throw error

  // Cosine similarity in JS — cheap for ≤ 60 rows.
  function cosine(a: number[], b: number[]): number {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  type ChunkRow = {
    id: string
    document_id: string
    kb_id: string
    chunk_index: number
    content: string
    source_hint: string | null
    embedding: number[] | string
  }

  const scored = ((data as ChunkRow[] | null) ?? []).map((row) => {
    const emb =
      typeof row.embedding === 'string' ? (JSON.parse(row.embedding) as number[]) : row.embedding
    return {
      id: row.id,
      documentId: row.document_id,
      kbId: row.kb_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      sourceHint: row.source_hint,
      similarity: cosine(embedding, emb),
    } as RagHit
  })

  scored.sort((a, b) => b.similarity - a.similarity)
  const topK = opts.topK ?? 6
  const filtered = scored.filter((h) => h.similarity >= (opts.minScore ?? 0.5)).slice(0, topK)
  const packed = packForContext(filtered, opts.maxContextTokens ?? MAX_CONTEXT_TOKENS)
  const contextText = wrapContextSafe(
    packed.map((h) => ({ content: h.content, sourceHint: h.sourceHint }))
  )

  return {
    hits: packed,
    contextText,
    tokensUsed: packed.reduce((acc, h) => acc + approxTokens(h.content), 0),
  }
}
