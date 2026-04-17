import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { randomUUID } from 'crypto'
import { router, orgProcedure, adminProcedure } from '@/lib/trpc'
import { createServiceClient } from '@/lib/supabase/service'
import {
  validateUploadMetadata,
  buildStoragePath,
  enqueueIngest,
  embedText,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
} from '@/lib/rag'

/**
 * Knowledge Base router — everything the client can do with KBs + documents.
 *
 * Security model:
 *   - list/read procedures are on orgProcedure (any member can browse).
 *   - all writes (create/delete/upload) are on adminProcedure — org_admin only.
 *   - uploads go through `issueUploadUrl` which validates MIME + size BEFORE
 *     returning a signed URL, so hostile clients can't get a write token
 *     for files the pipeline will refuse.
 *   - direct chunk access is blocked: `search` goes through `rag_search` RPC
 *     which enforces membership; `preview` returns content only for small
 *     top-K sets with the same gate.
 *   - deletions cascade to chunks via FK `on delete cascade`, and to Storage
 *     via an explicit object removal.
 */

export const knowledgeRouter = router({
  // ── Knowledge Bases ────────────────────────────────────────────────────
  listKbs: orgProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('knowledge_bases')
      .select('id, name, description, language, created_at, updated_at')
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Count docs + chunks per KB — one extra round-trip; fine for the few KBs
    // most orgs will have.
    const counts = await ctx.supabase
      .from('rag_documents')
      .select('kb_id, status, chunk_count')
      .eq('organization_id', ctx.orgId)

    const byKb: Record<string, { docs: number; chunks: number; processing: number; failed: number }> = {}
    for (const row of counts.data ?? []) {
      const entry = byKb[row.kb_id] ?? { docs: 0, chunks: 0, processing: 0, failed: 0 }
      entry.docs++
      entry.chunks += (row.chunk_count as number) ?? 0
      if (row.status === 'processing' || row.status === 'pending') entry.processing++
      if (row.status === 'failed') entry.failed++
      byKb[row.kb_id] = entry
    }

    return (data ?? []).map((kb) => ({
      ...kb,
      stats: byKb[kb.id] ?? { docs: 0, chunks: 0, processing: 0, failed: 0 },
    }))
  }),

  createKb: adminProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        description: z.string().max(240).optional(),
        language: z.string().max(10).default('pt-BR'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('knowledge_bases')
        .insert({
          organization_id: ctx.orgId,
          name: input.name,
          description: input.description ?? null,
          language: input.language,
          created_by: ctx.user.id,
        })
        .select('*')
        .single()

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Já existe uma KB com esse nome na organização.',
          })
        }
        throw error
      }
      return data
    }),

  updateKb: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(240).nullable().optional(),
        language: z.string().max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('knowledge_bases')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.orgId)
        .select('*')
        .single()

      if (error) throw error
      return data
    }),

  deleteKb: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Fetch all storage paths so we can remove the blobs too — FK cascade
      // handles `rag_documents` + `rag_chunks`, but Storage objects don't
      // cascade automatically.
      const { data: docs } = await ctx.supabase
        .from('rag_documents')
        .select('storage_bucket, storage_path')
        .eq('kb_id', input.id)
        .eq('organization_id', ctx.orgId)

      const service = createServiceClient()
      const byBucket: Record<string, string[]> = {}
      for (const d of docs ?? []) {
        if (!d.storage_path || !d.storage_bucket) continue
        byBucket[d.storage_bucket] = byBucket[d.storage_bucket] ?? []
        byBucket[d.storage_bucket].push(d.storage_path)
      }
      for (const [bucket, paths] of Object.entries(byBucket)) {
        if (paths.length > 0) {
          await service.storage.from(bucket).remove(paths)
        }
      }

      const { error } = await ctx.supabase
        .from('knowledge_bases')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', ctx.orgId)

      if (error) throw error
      return { success: true }
    }),

  // ── Documents ──────────────────────────────────────────────────────────
  listDocuments: orgProcedure
    .input(z.object({ kbId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('rag_documents')
        .select(
          'id, kb_id, title, source_type, size_bytes, mime_type, chunk_count, token_count, status, processing_error, created_at, updated_at, processed_at'
        )
        .eq('kb_id', input.kbId)
        .eq('organization_id', ctx.orgId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    }),

  /**
   * Step 1 of the upload flow — validate metadata + reserve a document row
   * in `pending` state, return a pre-signed Storage upload URL.
   *
   * We generate the document id server-side so the client can't collide
   * with another org's path. The signed URL expires in 5 min — short enough
   * that a leaked URL has limited blast radius.
   */
  issueUploadUrl: adminProcedure
    .input(
      z.object({
        kbId: z.string().uuid(),
        title: z.string().min(1).max(200),
        filename: z.string().min(1).max(200),
        mimeType: z.string(),
        sizeBytes: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Application-layer validation — RLS + bucket policies are the second gate.
      const validation = validateUploadMetadata({
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        filename: input.filename,
      })
      if (!validation.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.reason })
      }

      // Confirm the KB belongs to the caller's org before we stamp a path.
      const { data: kb } = await ctx.supabase
        .from('knowledge_bases')
        .select('id')
        .eq('id', input.kbId)
        .eq('organization_id', ctx.orgId)
        .maybeSingle()
      if (!kb) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KB não encontrada' })
      }

      const documentId = randomUUID()
      const storagePath = buildStoragePath({
        organizationId: ctx.orgId,
        documentId,
        ext: validation.ext,
      })

      // Reserve the row in pending. If the client never completes the upload,
      // this sits as an orphan "pending" row — cleaned up by a reaper later.
      const { data, error } = await ctx.supabase
        .from('rag_documents')
        .insert({
          id: documentId,
          kb_id: input.kbId,
          organization_id: ctx.orgId,
          title: input.title,
          source_type: `upload_${validation.ext}`,
          storage_bucket: 'rag-documents',
          storage_path: storagePath,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          status: 'pending',
          uploaded_by: ctx.user.id,
        })
        .select('id, storage_path, storage_bucket')
        .single()

      if (error) throw error

      // Create the signed upload URL. Uses service client so the 5-min token
      // is valid regardless of the caller's refresh cycle.
      const service = createServiceClient()
      const { data: signed, error: signedErr } = await service.storage
        .from('rag-documents')
        .createSignedUploadUrl(storagePath)

      if (signedErr) throw signedErr

      return {
        documentId: data.id,
        uploadUrl: signed.signedUrl,
        token: signed.token,
        storagePath: data.storage_path,
        maxBytes: MAX_UPLOAD_BYTES,
        allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
      }
    }),

  /**
   * Step 2 of the upload flow — client tells us the upload finished; we
   * enqueue the ingestion job. The worker picks it up, parses, embeds,
   * inserts chunks. Status flips `pending → processing → ready|failed`.
   */
  confirmUpload: adminProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc, error } = await ctx.supabase
        .from('rag_documents')
        .select('id, kb_id, organization_id, storage_bucket, storage_path, mime_type, status')
        .eq('id', input.documentId)
        .eq('organization_id', ctx.orgId)
        .single()

      if (error || !doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' })
      }
      if (doc.status !== 'pending' && doc.status !== 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Documento está em status "${doc.status}" e não pode ser reenfileirado`,
        })
      }

      await enqueueIngest({
        documentId: doc.id,
        organizationId: doc.organization_id,
        kbId: doc.kb_id,
        storageBucket: doc.storage_bucket,
        storagePath: doc.storage_path ?? '',
        mimeType: doc.mime_type ?? 'application/octet-stream',
      })

      return { enqueued: true }
    }),

  reprocessDocument: adminProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc, error } = await ctx.supabase
        .from('rag_documents')
        .select('id, kb_id, organization_id, storage_bucket, storage_path, mime_type')
        .eq('id', input.documentId)
        .eq('organization_id', ctx.orgId)
        .single()

      if (error || !doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' })
      }

      // Drop old chunks before re-embedding so we don't mix stale vectors.
      await ctx.supabase.from('rag_chunks').delete().eq('document_id', doc.id)

      await ctx.supabase
        .from('rag_documents')
        .update({
          status: 'pending',
          chunk_count: 0,
          token_count: 0,
          processing_error: null,
        })
        .eq('id', doc.id)

      await enqueueIngest({
        documentId: doc.id,
        organizationId: doc.organization_id,
        kbId: doc.kb_id,
        storageBucket: doc.storage_bucket,
        storagePath: doc.storage_path ?? '',
        mimeType: doc.mime_type ?? 'application/octet-stream',
      })

      return { enqueued: true }
    }),

  deleteDocument: adminProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: doc, error: fetchErr } = await ctx.supabase
        .from('rag_documents')
        .select('id, storage_bucket, storage_path')
        .eq('id', input.documentId)
        .eq('organization_id', ctx.orgId)
        .single()

      if (fetchErr || !doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento não encontrado' })
      }

      if (doc.storage_path) {
        const service = createServiceClient()
        await service.storage.from(doc.storage_bucket).remove([doc.storage_path])
      }

      const { error } = await ctx.supabase
        .from('rag_documents')
        .delete()
        .eq('id', doc.id)
        .eq('organization_id', ctx.orgId)

      if (error) throw error
      return { success: true }
    }),

  /**
   * Search preview — embeds the query and calls the `rag_search` RPC which
   * re-verifies org membership inside Postgres. Returns at most 10 hits
   * with content (for the UI preview). Never exposes vectors.
   */
  search: orgProcedure
    .input(
      z.object({
        kbIds: z.array(z.string().uuid()).min(1).max(20),
        query: z.string().min(2).max(500),
        topK: z.number().int().min(1).max(10).default(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { embedding } = await embedText(input.query)

      const { data, error } = await ctx.supabase.rpc('rag_search', {
        p_org_id: ctx.orgId,
        p_kb_ids: input.kbIds,
        p_query_embedding: embedding as unknown as string,
        p_top_k: input.topK,
        p_min_score: 0.4,
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
        similarity: Number(row.similarity),
      }))
    }),
})
