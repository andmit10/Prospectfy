-- ============================================================================
-- LLM Gateway — models + routes + telemetry
-- ============================================================================
-- Decouples call sites from the AI provider: every AI request goes through a
-- gateway that (1) resolves a model by task tier, (2) tries primary with
-- fallback to a second provider, (3) records telemetry for cost/latency/
-- quality observability.
--
-- This migration creates:
--   - llm_models         — catalog of enabled provider+model pairs
--   - llm_routes         — per-task routing: which model handles which task,
--                          with an optional fallback and response schema
--   - llm_telemetry      — per-request log (partition-ready) for P50/P95
--                          latency, tokens, schema validity, fallback usage
--
-- Seeds:
--   Models: qwen3-8b-ollama, qwen3-8b-vllm, claude-sonnet-4-5, claude-haiku-4
--   Routes: 7 tasks (chat, extract, sequence, classify, agent_loop,
--           lead_gen, embed) → primary/fallback mapping.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- llm_models
-- ---------------------------------------------------------------------------
create table llm_models (
  id text primary key,
  provider text not null
    check (provider in ('ollama','vllm','anthropic','openai')),
  display_name text not null,
  endpoint text,
  model_handle text not null,               -- e.g. 'qwen3:8b-q4' or 'claude-sonnet-4-5-20250514'
  context_window integer not null default 8192,
  max_output_tokens integer not null default 4096,
  cost_per_1k_in numeric(10,6) not null default 0,   -- USD per 1k input tokens
  cost_per_1k_out numeric(10,6) not null default 0,
  tier text not null
    check (tier in ('fast','balanced','alt_balanced','premium','embedding')),
  supports_tool_use boolean not null default false,
  supports_json_schema boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed: providers the Gateway speaks today.
-- Ollama / vLLM entries use local endpoints — edit in Supabase dashboard to
-- point at your deployed host. Disabled by default so they don't win routing
-- until an operator flips `enabled = true` and sets the endpoint.
insert into llm_models (id, provider, display_name, model_handle, endpoint, context_window, max_output_tokens, cost_per_1k_in, cost_per_1k_out, tier, supports_tool_use, supports_json_schema, enabled) values
  ('qwen3-8b-ollama',    'ollama',    'Qwen3 8B (Ollama, dev)',        'qwen3:8b-q4',                'http://127.0.0.1:11434', 32768, 4096, 0,        0,        'balanced',     true,  true,  false),
  ('qwen3-8b-vllm',      'vllm',      'Qwen3 8B (vLLM, prod)',         'Qwen/Qwen3-8B',              'http://127.0.0.1:8000',  32768, 4096, 0,        0,        'balanced',     true,  true,  false),
  ('bge-m3-ollama',      'ollama',    'BGE-M3 embeddings (Ollama)',    'bge-m3',                     'http://127.0.0.1:11434', 8192,  0,    0,        0,        'embedding',    false, false, false),
  ('claude-haiku-4',     'anthropic', 'Claude Haiku 4 (fast fallback)','claude-haiku-4-20250514',    null,                     200000, 8192, 0.0008,   0.004,    'fast',         true,  true,  true),
  ('claude-sonnet-4-5',  'anthropic', 'Claude Sonnet 4.5 (premium)',   'claude-sonnet-4-5-20250514', null,                     200000, 8192, 0.003,    0.015,    'premium',      true,  true,  true),
  ('openai-embed-small', 'openai',    'OpenAI text-embedding-3-small', 'text-embedding-3-small',     null,                     8191,  0,    0.00002,  0,        'embedding',    false, false, false);

create index idx_llm_models_tier on llm_models(tier) where enabled = true;
create index idx_llm_models_provider on llm_models(provider) where enabled = true;

-- ---------------------------------------------------------------------------
-- llm_routes — per-task routing
-- ---------------------------------------------------------------------------
create table llm_routes (
  task text primary key
    check (task in ('chat','extract','sequence','classify','agent_loop','lead_gen','embed')),
  primary_model_id text not null references llm_models(id),
  fallback_model_id text references llm_models(id),
  schema_name text,                          -- JSON Schema name in src/lib/llm/schemas/
  temperature numeric(3,2) not null default 0.7,
  max_tokens integer not null default 2048,
  description text,
  updated_at timestamptz not null default now()
);

-- Seed: initial routing strategy.
--   - Claude Sonnet 4.5 stays primary for anything tool_use or complex.
--   - Claude Haiku for fast/cheap classify.
--   - Qwen3-8B (local) becomes primary for extract/sequence/lead_gen when
--     the operator enables the model. Until then, Claude Sonnet wins
--     (we treat disabled primary as unusable and force fallback).
-- Fallback always points to a managed API so the product survives local
-- outages.
insert into llm_routes (task, primary_model_id, fallback_model_id, schema_name, temperature, max_tokens, description) values
  ('chat',       'claude-sonnet-4-5',  'claude-haiku-4',    null,                0.8,  2048, 'General chat / human-style responses'),
  ('extract',    'qwen3-8b-vllm',      'claude-sonnet-4-5', 'extract-generic',   0.2,  2048, 'Structured data extraction (JSON schema)'),
  ('sequence',   'qwen3-8b-vllm',      'claude-sonnet-4-5', 'sequence-step',     0.7,  1024, 'Message generation for cadence step'),
  ('classify',   'qwen3-8b-ollama',    'claude-haiku-4',    'classify-intent',   0.1,  256,  'Short classification (intent/sentiment)'),
  ('agent_loop', 'claude-sonnet-4-5',  null,                null,                0.6,  4096, 'Agent loop with tool_use (stays on Claude for reliability)'),
  ('lead_gen',   'claude-sonnet-4-5',  'qwen3-8b-vllm',     'generate-leads',    0.7,  4096, 'Batch lead generation — Claude primary for recall, Qwen fallback'),
  ('embed',      'bge-m3-ollama',      'openai-embed-small',null,                0,    0,    'Text embedding for RAG');

-- ---------------------------------------------------------------------------
-- llm_telemetry — observability per request
-- ---------------------------------------------------------------------------
-- One row per LLM call. Kept open to all org members (via RLS) so that the
-- product dashboard can show the caller their own usage / latency stats.
-- Super-admin dashboards read all rows via service role.
create table llm_telemetry (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  agent_id uuid,                             -- nullable — fk added in Phase 4
  task text not null,
  model_id text not null references llm_models(id),
  request_id text,                           -- correlation id between primary + fallback attempts
  latency_ms integer not null default 0,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  schema_valid boolean,                      -- null when the task has no schema
  fallback_used boolean not null default false,
  fallback_reason text,
  error text,
  cost_usd numeric(12,6) not null default 0,
  conversion_signal text,                    -- filled later by auto-progression when a conversion ties back
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_llm_telemetry_org_created on llm_telemetry(org_id, created_at desc)
  where org_id is not null;
create index idx_llm_telemetry_task_created on llm_telemetry(task, created_at desc);
create index idx_llm_telemetry_model_created on llm_telemetry(model_id, created_at desc);
create index idx_llm_telemetry_request on llm_telemetry(request_id)
  where request_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table llm_models enable row level security;
alter table llm_routes enable row level security;
alter table llm_telemetry enable row level security;

-- llm_models + llm_routes: read-open (operators configure via migrations or
-- the admin dashboard in Phase 6). Writes are service-role only.
create policy "Anyone reads llm_models" on llm_models
  for select using (true);
create policy "Anyone reads llm_routes" on llm_routes
  for select using (true);

-- llm_telemetry: org members read their own rows. Inserts come from the
-- server (service role bypasses RLS), so no insert policy is required for
-- the authenticated role.
create policy "Org members read their telemetry" on llm_telemetry
  for select using (
    org_id is not null
    and org_id in (select public.user_orgs())
  );

-- ---------------------------------------------------------------------------
-- touch_updated_at trigger on routes (tuning is cheap, audit who changed what)
-- ---------------------------------------------------------------------------
create trigger trg_llm_routes_updated_at
  before update on llm_routes
  for each row execute function public.touch_updated_at();
