import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { createServiceClient } from '@/lib/supabase/service'
import { chunkText } from './chunker'
import { embedChunks } from './embeddings'
import { parseByMime } from './parsers'

/**
 * Ingestion pipeline — parse → chunk → embed → insert. Runs on the BullMQ
 * `rag-ingest` queue from `workers/rag-ingest-worker.ts`. Callers enqueue
 * via `enqueueIngest()` after the Storage upload completes.
 *
 * Flow:
 *   1. Download bytes from Supabase Storage (service role; bucket is private)
 *   2. Parse to plain text with the mime-specific parser
 *   3. Chunk (512 tok / 64 overlap)
 *   4. Embed each chunk through `@/lib/llm` (BGE-M3 primary, OpenAI fallback)
 *   5. Insert rows with `organization_id` stamped for RLS
 *   6. Mark document as `ready` (or `failed` with the error message)
 */

export const RAG_INGEST_QUEUE = 'rag-ingest'

export type IngestJobPayload = {
  documentId: string
  organizationId: string
  kbId: string
  storageBucket: string
  storagePath: string
  mimeType: string
  /** Optional hint like "ICP > Segmento > Saúde" appended to every chunk */
  sourceHint?: string | null
}

// ── Queue producer ──

let _queue: Queue<IngestJobPayload> | null = null

function getQueue(): Queue<IngestJobPayload> {
  if (_queue) return _queue
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL not set — RAG ingestion requires BullMQ')
  }
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
  _queue = new Queue<IngestJobPayload>(RAG_INGEST_QUEUE, { connection })
  return _queue
}

export async function enqueueIngest(payload: IngestJobPayload): Promise<void> {
  const q = getQueue()
  await q.add('ingest', payload, {
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
  })
}

// ── Job processor (called by the worker) ──

async function downloadBytes(
  bucket: string,
  path: string
): Promise<Uint8Array> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? 'unknown'}`)
  const buf = await data.arrayBuffer()
  return new Uint8Array(buf)
}

async function markFailed(documentId: string, reason: string) {
  const supabase = createServiceClient()
  await supabase
    .from('rag_documents')
    .update({
      status: 'failed',
      processing_error: reason.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', documentId)
}

export async function processIngestJob(payload: IngestJobPayload): Promise<{
  chunks: number
  tokens: number
  modelId: string
}> {
  const supabase = createServiceClient()
  const doc = payload

  // Mark processing so the UI can reflect status.
  await supabase
    .from('rag_documents')
    .update({ status: 'processing', processing_error: null })
    .eq('id', doc.documentId)

  try {
    // 1. Download
    const bytes = await downloadBytes(doc.storageBucket, doc.storagePath)

    // 2. Parse
    const text = await parseByMime(doc.mimeType, bytes)
    if (!text.trim()) {
      await markFailed(doc.documentId, 'Arquivo vazio após parser')
      return { chunks: 0, tokens: 0, modelId: '' }
    }

    // 3. Chunk
    const chunks = chunkText(text, { sourceHint: doc.sourceHint ?? null })
    if (chunks.length === 0) {
      await markFailed(doc.documentId, 'Chunker não produziu chunks')
      return { chunks: 0, tokens: 0, modelId: '' }
    }

    // 4. Embed (sequential in v1 — optimize later when volume demands).
    const { embeddings, tokensTotal, modelId } = await embedChunks(
      chunks.map((c) => c.content)
    )

    // 5. Insert. Batched to avoid query size blow-up on big docs.
    const BATCH = 100
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH)
      const rows = slice.map((c, idx) => ({
        document_id: doc.documentId,
        kb_id: doc.kbId,
        organization_id: doc.organizationId,
        chunk_index: c.index,
        content: c.content,
        tokens: c.approxTokens,
        embedding: embeddings[i + idx] as unknown as string, // pgvector accepts arrays
        source_hint: c.sourceHint,
      }))
      const { error } = await supabase.from('rag_chunks').insert(rows)
      if (error) throw error
    }

    // 6. Mark ready + counters.
    await supabase
      .from('rag_documents')
      .update({
        status: 'ready',
        chunk_count: chunks.length,
        token_count: tokensTotal,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq('id', doc.documentId)

    return { chunks: chunks.length, tokens: tokensTotal, modelId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markFailed(doc.documentId, msg)
    throw err
  }
}
