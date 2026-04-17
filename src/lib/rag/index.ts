/**
 * Public surface of the RAG module.
 */

export { chunkText, type Chunk, type ChunkOptions } from './chunker'
export { embedText, embedChunks } from './embeddings'
export { retrieve, retrieveAsWorker, type RagHit, type RetrieveOptions } from './retrieve'
export { enqueueIngest, processIngestJob, RAG_INGEST_QUEUE, type IngestJobPayload } from './ingest'
export { parseByMime } from './parsers'
export {
  validateUploadMetadata,
  buildStoragePath,
  wrapContextSafe,
  sanitizeForIngest,
  sha256,
  MAX_UPLOAD_BYTES,
  MAX_CONTEXT_TOKENS,
  ALLOWED_MIME_TYPES,
} from './security'
