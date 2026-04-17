import { Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { RAG_INGEST_QUEUE, processIngestJob, type IngestJobPayload } from '@/lib/rag'

/**
 * BullMQ consumer for RAG ingestion jobs. Low concurrency because each job
 * does I/O-heavy work (download, parse, embed N chunks); running 3 at a time
 * is a safe ceiling for both local Ollama and paid OpenAI quotas.
 *
 * Failures are visible to the user via `rag_documents.processing_error` —
 * they can click "Reprocessar" to retry.
 */

const REDIS_URL = process.env.REDIS_URL

if (!REDIS_URL) {
  console.warn('[rag-ingest] REDIS_URL not set — worker disabled')
} else {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })

  const worker = new Worker<IngestJobPayload>(
    RAG_INGEST_QUEUE,
    async (job: Job<IngestJobPayload>) => {
      const result = await processIngestJob(job.data)
      return result
    },
    {
      connection,
      concurrency: 3,
    }
  )

  worker.on('completed', (job, result) => {
    console.log(
      `[rag-ingest] job ${job.id} done — doc ${job.data.documentId}: ${result.chunks} chunks / ${result.tokens} tokens`
    )
  })

  worker.on('failed', (job, err) => {
    console.error(
      `[rag-ingest] job ${job?.id} failed for doc ${job?.data.documentId}:`,
      err.message
    )
  })

  console.log('[rag-ingest] BullMQ RAG ingestion worker started')
}
