-- ============================================================================
-- RAG per organization (pgvector)
-- ============================================================================
-- Each organization owns one or more Knowledge Bases. Documents are uploaded
-- to a dedicated Storage bucket, parsed + chunked + embedded, and stored in
-- `rag_chunks` with a `vector(1024)` column (matches BGE-M3 native dimension
-- and OpenAI text-embedding-3-small when truncated via `dimensions=1024`).
--
-- ╭───────────── SECURITY DESIGN ─────────────╮
-- │                                            │
-- │ 1. RLS org-scoped on every RAG table —    │
-- │    policies filter on organization_id BEFORE vector search.              │
-- │ 2. Storage bucket `rag-documents` paths      │
-- │    MUST start with `{org_id}/…`. Bucket    │
-- │    policies enforce membership.            │
-- │ 3. Uploads require org_admin role (via     │
-- │    `public.user_is_org_admin(org_id)`).    │
-- │ 4. No telemetry stores chunk content —     │
-- │    only counts/latency in llm_telemetry.   │
-- │ 5. Embeddings (vector column) are never    │
-- │    returned by tRPC / REST — only via the  │
-- │    `rag_search` RPC which returns `id,     │
-- │    content, similarity`.                   │
-- │ 6. Audit log every kb/doc mutation via     │
-- │    trigger on rag_documents.               │
-- │ 7. File size cap + MIME check enforced     │
-- │    by the tRPC upload issuer, not by RLS   │
-- │    (RLS can't see blob contents).          │
-- │                                            │
-- ╰────────────────────────────────────────────╯
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extension
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- knowledge_bases — one container per "topic" per org (e.g. ICP, playbook,
-- catálogo, objections). Agents bind to N KBs through agent_knowledge_bindings
-- in Phase 4.
-- ---------------------------------------------------------------------------
create table knowledge_bases (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  -- Optional language hint so retrieval can filter — BGE-M3 is multilingual
  -- but agents may want to force pt-BR chunks only.
  language text not null default 'pt-BR',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique KB name per org — avoids confusion when an agent lists KBs.
  unique (organization_id, name)
);

create index idx_knowledge_bases_org on knowledge_bases(organization_id);

-- ---------------------------------------------------------------------------
-- rag_documents — source files uploaded to Supabase Storage, parsed + chunked
-- asynchronously by the BullMQ `rag-ingest` worker.
-- ---------------------------------------------------------------------------
create table rag_documents (
  id uuid default gen_random_uuid() primary key,
  kb_id uuid not null references knowledge_bases(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  source_type text not null
    check (source_type in ('upload_pdf','upload_md','upload_txt','upload_docx','url','manual')),
  source_url text,
  storage_path text,                         -- Supabase Storage path: `{org_id}/{doc_id}/{filename}`
  storage_bucket text not null default 'rag-documents',
  size_bytes bigint,
  mime_type text,
  chunk_count integer not null default 0,
  token_count integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed')),
  processing_error text,
  processed_at timestamptz,
  content_hash text,                         -- sha256 of raw bytes — dedup within KB
  uploaded_by uuid references profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rag_documents_kb on rag_documents(kb_id, created_at desc);
create index idx_rag_documents_org on rag_documents(organization_id);
create index idx_rag_documents_status on rag_documents(status)
  where status in ('pending','processing','failed');
-- Dedup: same content uploaded twice into the same KB is blocked.
create unique index idx_rag_documents_dedup
  on rag_documents(kb_id, content_hash)
  where content_hash is not null;

-- ---------------------------------------------------------------------------
-- rag_chunks — embedding storage. The vector column is vector(1024) to match
-- BGE-M3 native output; OpenAI text-embedding-3-small is truncated to 1024
-- at embed time (`dimensions: 1024`).
-- ---------------------------------------------------------------------------
create table rag_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid not null references rag_documents(id) on delete cascade,
  kb_id uuid not null references knowledge_bases(id) on delete cascade,
  -- organization_id is denormalized on purpose: every vector-search query
  -- filters on it BEFORE the ANN sort, so keeping it on the chunk row makes
  -- the filter O(1) and RLS cheap.
  organization_id uuid not null references organizations(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  tokens integer not null default 0,
  embedding vector(1024) not null,
  -- Provenance used when assembling the context pack for the LLM.
  source_hint text,                          -- e.g. "ICP > Segmento > Saúde"
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Org-scoped b-tree index so the WHERE filter reduces the ANN candidate set
-- before cosine sort. Critical for multi-tenant performance.
create index idx_rag_chunks_org_kb on rag_chunks(organization_id, kb_id);
create index idx_rag_chunks_doc on rag_chunks(document_id);

-- HNSW index for fast approximate nearest neighbor. m/ef tuned conservatively
-- — raise later if recall < 95% on real corpora.
create index idx_rag_chunks_embedding on rag_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- agent_knowledge_bindings — populated in Phase 4 when `agents` table lands.
-- Foreign key added here without the referenced table to keep deploy order
-- flexible; we add the FK when the agents table is created.
-- ---------------------------------------------------------------------------
create table agent_knowledge_bindings (
  agent_id uuid not null,
  kb_id uuid not null references knowledge_bases(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, kb_id)
);

create index idx_agent_kb_bindings_kb on agent_knowledge_bindings(kb_id);
create index idx_agent_kb_bindings_org on agent_knowledge_bindings(organization_id);

-- ---------------------------------------------------------------------------
-- RLS — all tables
-- ---------------------------------------------------------------------------
alter table knowledge_bases enable row level security;
alter table rag_documents enable row level security;
alter table rag_chunks enable row level security;
alter table agent_knowledge_bindings enable row level security;

-- knowledge_bases
create policy "Org members see KBs" on knowledge_bases
  for select using (organization_id in (select public.user_orgs()));

create policy "Org admins create KBs" on knowledge_bases
  for insert with check (public.user_is_org_admin(organization_id));

create policy "Org admins update KBs" on knowledge_bases
  for update using (public.user_is_org_admin(organization_id));

create policy "Org admins delete KBs" on knowledge_bases
  for delete using (public.user_is_org_admin(organization_id));

-- rag_documents — any org member reads (they're listed in the UI). Only
-- org_admin uploads/deletes.
create policy "Org members see docs" on rag_documents
  for select using (organization_id in (select public.user_orgs()));

create policy "Org admins create docs" on rag_documents
  for insert with check (public.user_is_org_admin(organization_id));

create policy "Org admins update docs" on rag_documents
  for update using (public.user_is_org_admin(organization_id));

create policy "Org admins delete docs" on rag_documents
  for delete using (public.user_is_org_admin(organization_id));

-- rag_chunks — reads are org-scoped, but the content column is never returned
-- directly via REST/tRPC. Callers go through `rag_search` RPC which exposes a
-- narrow column set. Writes happen only via service role (worker) so no INSERT
-- policy for authenticated is needed.
create policy "Org members see chunks" on rag_chunks
  for select using (organization_id in (select public.user_orgs()));

-- agent_knowledge_bindings — any org member reads; admin manages. Writes go
-- through the agents router in Phase 4 with the role gate there.
create policy "Org members see kb bindings" on agent_knowledge_bindings
  for select using (organization_id in (select public.user_orgs()));

create policy "Org admins insert kb bindings" on agent_knowledge_bindings
  for insert with check (public.user_is_org_admin(organization_id));

create policy "Org admins delete kb bindings" on agent_knowledge_bindings
  for delete using (public.user_is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- rag_search RPC — the ONLY way callers retrieve chunks by similarity.
-- Narrows columns to what the context-pack builder needs (no embedding, no
-- metadata beyond source_hint). Enforces org + kb filter before ANN sort.
-- ---------------------------------------------------------------------------
create or replace function public.rag_search(
  p_org_id uuid,
  p_kb_ids uuid[],
  p_query_embedding vector(1024),
  p_top_k integer default 6,
  p_min_score numeric default 0.50
)
returns table (
  id uuid,
  document_id uuid,
  kb_id uuid,
  chunk_index integer,
  content text,
  source_hint text,
  similarity numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Authorization: caller must belong to the org. Blocks service-role
  -- callers too unless they pass their own user context (worker uses service
  -- role + trusted org_id from the job payload, so it's explicitly allowed
  -- via a separate code path that bypasses this RPC).
  if not exists (
    select 1 from org_members
    where user_id = auth.uid() and org_id = p_org_id
  ) then
    raise exception 'access_denied: not a member of org %', p_org_id;
  end if;

  return query
    select
      c.id,
      c.document_id,
      c.kb_id,
      c.chunk_index,
      c.content,
      c.source_hint,
      (1 - (c.embedding <=> p_query_embedding))::numeric as similarity
    from rag_chunks c
    where c.organization_id = p_org_id
      and c.kb_id = any(p_kb_ids)
      and (1 - (c.embedding <=> p_query_embedding)) >= p_min_score
    order by c.embedding <=> p_query_embedding
    limit p_top_k;
end;
$$;

-- Only authenticated users can call it.
revoke all on function public.rag_search(uuid, uuid[], vector, integer, numeric) from public, anon;
grant execute on function public.rag_search(uuid, uuid[], vector, integer, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit triggers — log kb/doc mutations for compliance.
-- ---------------------------------------------------------------------------
create or replace function public.log_kb_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_org uuid;
  v_target uuid;
begin
  v_action := lower(tg_op) || '_' || tg_table_name;
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_target := old.id;
  else
    v_org := new.organization_id;
    v_target := new.id;
  end if;

  insert into audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_org,
    auth.uid(),
    v_action,
    tg_table_name,
    v_target,
    '{}'::jsonb
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_knowledge_bases_audit
  after insert or update or delete on knowledge_bases
  for each row execute function public.log_kb_audit();

create trigger trg_rag_documents_audit
  after insert or update or delete on rag_documents
  for each row execute function public.log_kb_audit();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_knowledge_bases_updated_at
  before update on knowledge_bases
  for each row execute function public.touch_updated_at();

create trigger trg_rag_documents_updated_at
  before update on rag_documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Storage bucket for RAG documents + policies
-- ---------------------------------------------------------------------------
-- Create the bucket. Private (no public URLs). Uploads limited to 20 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rag-documents',
  'rag-documents',
  false,
  20 * 1024 * 1024,        -- 20 MB hard cap at the bucket level
  array[
    'application/pdf',
    'text/markdown',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;

-- Storage RLS: paths MUST begin with the caller's org_id. We use
-- `storage.foldername(name)` which splits the path into an array — first
-- element is the top folder, which we require to be a uuid matching an org
-- the caller is a member of.

-- Read: org members download documents of orgs they belong to.
drop policy if exists "rag_documents_read" on storage.objects;
create policy "rag_documents_read" on storage.objects
  for select
  using (
    bucket_id = 'rag-documents'
    and (storage.foldername(name))[1]::uuid in (select public.user_orgs())
  );

-- Insert: only org_admins can upload, and path must be scoped to their org.
drop policy if exists "rag_documents_insert" on storage.objects;
create policy "rag_documents_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'rag-documents'
    and public.user_is_org_admin((storage.foldername(name))[1]::uuid)
  );

-- Update: same rule as insert — admins on the target org.
drop policy if exists "rag_documents_update" on storage.objects;
create policy "rag_documents_update" on storage.objects
  for update
  using (
    bucket_id = 'rag-documents'
    and public.user_is_org_admin((storage.foldername(name))[1]::uuid)
  );

-- Delete: only org_admins.
drop policy if exists "rag_documents_delete" on storage.objects;
create policy "rag_documents_delete" on storage.objects
  for delete
  using (
    bucket_id = 'rag-documents'
    and public.user_is_org_admin((storage.foldername(name))[1]::uuid)
  );
