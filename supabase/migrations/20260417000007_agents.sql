-- ============================================================================
-- Agents v2 — declarative agent definitions + run history + metrics + AI suggestions
-- ============================================================================
-- Previous iteration had a single hardcoded "prospecting agent" running as a
-- BullMQ job. v2 decouples the DEFINITION (what the agent does) from the
-- RUNTIME (how it executes), making agents:
--   - user-creatable via natural language (compiled by the local LLM)
--   - visually inspectable + editable (DSL is plain JSON)
--   - org-scoped with RLS everywhere
--   - observable (every run + tool_call + token recorded)
--   - continuously improved (agent_suggestions table holds AI-generated
--     recommendations the operator can accept/dismiss)
--
-- ╭───────────── SECURITY DESIGN ─────────────╮
-- │ 1. RLS org-scoped on every table.         │
-- │ 2. `agents.tools` is an allowlist — the   │
-- │    runtime rejects tool calls not in the  │
-- │    whitelist (double check vs LLM hallucination). │
-- │ 3. `agents.channels` + `agents.kb_ids`    │
-- │    are also whitelists enforced at run    │
-- │    time (never trust the compiled DSL     │
-- │    to self-govern).                       │
-- │ 4. Definitions validated server-side via  │
-- │    Zod (`src/lib/agents/definition.ts`)   │
-- │    before persisting — LLM-generated DSL  │
-- │    that fails validation is rejected.     │
-- │ 5. Audit trigger on `agents` logs every   │
-- │    create/update/delete.                  │
-- │ 6. `agent_runs.tool_calls` + `reasoning`  │
-- │    kept for compliance and debugging;     │
-- │    never expose to clients unsanitized.   │
-- ╰────────────────────────────────────────────╯
-- ============================================================================

-- ---------------------------------------------------------------------------
-- agents — one row per agent definition per org
-- ---------------------------------------------------------------------------
create table agents (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Display
  name text not null,
  slug text not null,                        -- kebab-case; unique per org for stable URLs
  description text,
  category text not null default 'custom'
    check (category in (
      'prospecting','qualifying','enrichment','outreach',
      'follow_up','customer_success','analysis','whatsapp','custom'
    )),
  -- Lifecycle
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  -- DSL — the agent's behavior as structured JSON. Validated with Zod in
  -- src/lib/agents/definition.ts before this column is ever written. We
  -- keep it permissive at the SQL level since the app layer is the source
  -- of truth for what a valid definition is.
  definition jsonb not null default '{}'::jsonb,
  -- System prompt seed — compiled + cached from definition, used directly
  -- by the runtime. Rebuilt whenever `definition` changes.
  system_prompt text,
  -- Whitelists enforced by the runtime. `tools` and `channels` must be
  -- populated whenever status='active'.
  tools text[] not null default '{}'::text[],
  channels text[] not null default '{}'::text[],
  kb_ids uuid[] not null default '{}'::uuid[],
  -- LLM routing knobs (default to the 'agent_loop' route)
  llm_task text not null default 'agent_loop',
  temperature numeric(3,2),
  max_tokens integer,
  -- Trigger spec (kept as jsonb so we can iterate on triggers without migrations)
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual','lead_created','pipeline_stage_change','cron','response_received','webhook')),
  trigger_config jsonb not null default '{}'::jsonb,
  -- Optional cron (when trigger_type='cron')
  cron_expression text,
  cron_timezone text default 'America/Sao_Paulo',
  -- Linking
  created_by uuid references profiles(id) on delete set null,
  created_from_template text,                -- template id when cloned from a preset
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index idx_agents_org_status on agents(organization_id, status);
create index idx_agents_category on agents(organization_id, category);
create index idx_agents_active_cron on agents(trigger_type, status)
  where status = 'active' and trigger_type = 'cron';

-- ---------------------------------------------------------------------------
-- agent_runs — one row per execution
-- ---------------------------------------------------------------------------
create table agent_runs (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid not null references agents(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  trigger text not null,                     -- 'manual' | 'cron' | 'webhook' | 'response_received' | ...
  trigger_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'running'
    check (status in ('running','success','failed','cancelled','skipped')),
  -- Execution telemetry
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  latency_ms integer,
  tokens_used integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  -- Audit: every tool call, its args, and the result. Capped to 64KB by the
  -- runtime to prevent runaway payloads in long tool loops.
  tool_calls jsonb not null default '[]'::jsonb,
  -- LLM reasoning text (collected across the agent loop) — useful for debugging
  -- prompt regressions. Never exposed to the lead.
  reasoning text,
  -- Step-by-step trace: which DSL step ran, what output it produced.
  step_trace jsonb not null default '[]'::jsonb,
  -- Error message when status='failed'
  error text,
  -- Outcome signal (filled by auto-progression / webhook handler later)
  outcome text,                              -- 'replied','meeting_scheduled','unsubscribed',...
  outcome_at timestamptz
);

create index idx_agent_runs_agent_started on agent_runs(agent_id, started_at desc);
create index idx_agent_runs_lead on agent_runs(lead_id, started_at desc) where lead_id is not null;
create index idx_agent_runs_org_status on agent_runs(organization_id, status, started_at desc);

-- ---------------------------------------------------------------------------
-- agent_metrics — rolled-up daily counters per agent
-- ---------------------------------------------------------------------------
create table agent_metrics (
  agent_id uuid not null references agents(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  period_date date not null,
  executions integer not null default 0,
  successes integer not null default 0,
  failures integer not null default 0,
  -- Conversion funnel tracked from agent_runs.outcome
  responses integer not null default 0,
  meetings integer not null default 0,
  unsubscribes integer not null default 0,
  -- Averages
  avg_latency_ms integer not null default 0,
  total_tokens bigint not null default 0,
  total_cost_usd numeric(14,6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (agent_id, period_date)
);

create index idx_agent_metrics_org_period on agent_metrics(organization_id, period_date desc);

-- Keep the table in sync on every new run. We deliberately use a trigger
-- rather than a batch job so the dashboard reflects live activity.
create or replace function public.update_agent_metrics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period date := date(coalesce(new.ended_at, new.started_at));
begin
  insert into agent_metrics (
    agent_id, organization_id, period_date,
    executions, successes, failures,
    avg_latency_ms, total_tokens, total_cost_usd, updated_at
  )
  values (
    new.agent_id, new.organization_id, v_period,
    1,
    case when new.status = 'success' then 1 else 0 end,
    case when new.status = 'failed' then 1 else 0 end,
    coalesce(new.latency_ms, 0),
    coalesce(new.tokens_used, 0),
    coalesce(new.cost_usd, 0),
    now()
  )
  on conflict (agent_id, period_date) do update set
    executions = agent_metrics.executions + 1,
    successes = agent_metrics.successes + case when new.status = 'success' then 1 else 0 end,
    failures = agent_metrics.failures + case when new.status = 'failed' then 1 else 0 end,
    avg_latency_ms = (
      (agent_metrics.avg_latency_ms * agent_metrics.executions + coalesce(new.latency_ms, 0))
      / (agent_metrics.executions + 1)
    ),
    total_tokens = agent_metrics.total_tokens + coalesce(new.tokens_used, 0),
    total_cost_usd = agent_metrics.total_cost_usd + coalesce(new.cost_usd, 0),
    updated_at = now();
  return new;
end;
$$;

-- Fires when a run reaches a terminal state (status update from 'running' to
-- success/failed/cancelled). We use AFTER UPDATE so `ended_at` + counters are
-- populated by the runtime before the trigger reads them.
create trigger trg_agent_runs_metrics
  after update on agent_runs
  for each row
  when (old.status = 'running' and new.status in ('success','failed','cancelled'))
  execute function public.update_agent_metrics();

-- Outcome funnel — updated by auto-progression (Phase 5) or webhook handlers
-- when an outcome is attributed back to a run.
create or replace function public.record_agent_outcome()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period date := date(new.outcome_at);
begin
  if new.outcome is null then return new; end if;
  -- Only count the FIRST time an outcome lands on a run.
  if old.outcome is not null and old.outcome = new.outcome then return new; end if;

  update agent_metrics set
    responses = responses + case when new.outcome = 'replied' then 1 else 0 end,
    meetings = meetings + case when new.outcome = 'meeting_scheduled' then 1 else 0 end,
    unsubscribes = unsubscribes + case when new.outcome = 'unsubscribed' then 1 else 0 end,
    updated_at = now()
  where agent_id = new.agent_id and period_date = v_period;

  return new;
end;
$$;

create trigger trg_agent_runs_outcome
  after update of outcome on agent_runs
  for each row execute function public.record_agent_outcome();

-- ---------------------------------------------------------------------------
-- agent_suggestions — AI-generated recommendations the operator can apply
-- ---------------------------------------------------------------------------
create table agent_suggestions (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  kind text not null
    check (kind in (
      'activate_template',        -- "Based on your usage, activate template X"
      'tune_schedule',             -- "Your best responses happen at 10am; reschedule cron"
      'improve_prompt',            -- "Response rate dropped 40%; rewrite system prompt"
      'add_knowledge',             -- "Leads ask about X; add a KB with that answer"
      'pause_underperformer',      -- "Agent Y has 2% reply rate; pause"
      'duplicate_winner',          -- "Agent Z performs 3x better on segment S; clone for segment T"
      'new_segment'                -- "You have 120 leads in untouched segment; create agent"
    )),
  title text not null,
  rationale text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','accepted','dismissed','expired')),
  score numeric(3,2) not null default 0.5,    -- 0..1 priority rank
  generated_by_model text,                     -- which LLM model produced it
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  acted_at timestamptz,
  acted_by uuid references profiles(id) on delete set null
);

create index idx_agent_suggestions_org_status on agent_suggestions(organization_id, status, score desc);
create index idx_agent_suggestions_agent on agent_suggestions(agent_id) where agent_id is not null;

-- ---------------------------------------------------------------------------
-- agent_templates — seed catalog of ready-made agents users can clone.
-- Not org-scoped (global templates). Readable by everyone, writable only
-- by migrations.
-- ---------------------------------------------------------------------------
create table agent_templates (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  definition jsonb not null,
  icon_name text,
  tags text[] not null default '{}'::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed a minimal starter catalog. Definitions are intentionally short —
-- users compile their own via NL. These serve as "copy & customize" starters.
insert into agent_templates (id, name, description, category, definition, icon_name, tags) values
  ('prospector-b2b', 'Prospector B2B inteligente',
    'Encontra decisores em empresas do ICP com email validado e LinkedIn ativo.',
    'prospecting',
    jsonb_build_object(
      'version', 1,
      'goal', 'Prospectar leads B2B dentro do ICP e iniciar conversa no WhatsApp',
      'trigger', jsonb_build_object('type','manual'),
      'tools', jsonb_build_array('search_knowledge','send_message','update_lead_score'),
      'channels', jsonb_build_array('whatsapp'),
      'steps', jsonb_build_array(
        jsonb_build_object('type','llm_task','task','sequence','prompt_var','generated_message','output_var','msg'),
        jsonb_build_object('type','tool_call','tool','send_message','args',jsonb_build_object('channel','whatsapp','content_var','msg.message')),
        jsonb_build_object('type','tool_call','tool','update_lead_score','args',jsonb_build_object('points',5,'reason','first touch'))
      )
    ),
    'UserSearch', array['b2b','whatsapp']
  ),
  ('bant-qualifier', 'Qualificador BANT',
    'Pontua leads de 0 a 100 usando Budget/Authority/Need/Timing.',
    'qualifying',
    jsonb_build_object(
      'version', 1,
      'goal', 'Qualificar lead usando BANT a partir das interações disponíveis',
      'trigger', jsonb_build_object('type','response_received'),
      'tools', jsonb_build_array('classify_text','update_lead_score','move_pipeline_stage'),
      'steps', jsonb_build_array(
        jsonb_build_object('type','llm_task','task','classify','output_var','bant'),
        jsonb_build_object('type','tool_call','tool','update_lead_score','args',jsonb_build_object('points_var','bant.score','reason','BANT qualification'))
      )
    ),
    'BarChart3', array['bant','qualify']
  ),
  ('reengage-cold', 'Reengajamento de frios',
    'Envia follow-up personalizado para leads sem resposta há 7+ dias.',
    'follow_up',
    jsonb_build_object(
      'version', 1,
      'goal', 'Reaquecer leads que pararam de responder',
      'trigger', jsonb_build_object('type','cron'),
      'tools', jsonb_build_array('send_message','search_knowledge'),
      'channels', jsonb_build_array('whatsapp','email')
    ),
    'Megaphone', array['followup','reengage']
  ),
  ('sdr-24-7', 'SDR WhatsApp 24/7',
    'Conversa com leads, qualifica e agenda reuniões direto no WhatsApp.',
    'whatsapp',
    jsonb_build_object(
      'version', 1,
      'goal', 'Atender respostas de lead no WhatsApp até agendar reunião',
      'trigger', jsonb_build_object('type','response_received'),
      'tools', jsonb_build_array('classify_text','search_knowledge','send_message','schedule_meeting','move_pipeline_stage'),
      'channels', jsonb_build_array('whatsapp')
    ),
    'Bot', array['sdr','meeting']
  ),
  ('conversation-analyst', 'Analista de conversas',
    'Lê interações e aponta objeções mais comuns + próximos passos.',
    'analysis',
    jsonb_build_object(
      'version', 1,
      'goal', 'Gerar um sumário diário com objeções e próximos passos',
      'trigger', jsonb_build_object('type','cron'),
      'tools', jsonb_build_array('classify_text','search_knowledge')
    ),
    'BarChart3', array['analysis','objections']
  );

-- ---------------------------------------------------------------------------
-- agent_knowledge_bindings — add the deferred FK to agents.id now that the
-- agents table exists.
-- ---------------------------------------------------------------------------
alter table agent_knowledge_bindings
  add constraint fk_agent_kb_bindings_agent
  foreign key (agent_id) references agents(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table agents enable row level security;
alter table agent_runs enable row level security;
alter table agent_metrics enable row level security;
alter table agent_suggestions enable row level security;
alter table agent_templates enable row level security;

-- agents — members read; writers (org_admin + member) mutate. Non-admins
-- should be able to create/edit their own agents, matching how most SaaS
-- operate. Org_admins can delete.
create policy "Org members see agents" on agents
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create agents" on agents
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org writers update agents" on agents
  for update using (public.user_can_write_org(organization_id));
create policy "Org admins delete agents" on agents
  for delete using (public.user_is_org_admin(organization_id));

-- agent_runs — members read, writes are service-role only (runtime).
create policy "Org members see agent runs" on agent_runs
  for select using (organization_id in (select public.user_orgs()));

-- agent_metrics — members read, writes by trigger (SECURITY DEFINER).
create policy "Org members see agent metrics" on agent_metrics
  for select using (organization_id in (select public.user_orgs()));

-- agent_suggestions — members read, writes by worker (service role).
-- Admins can mark as accepted/dismissed.
create policy "Org members see suggestions" on agent_suggestions
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers update suggestion status" on agent_suggestions
  for update using (public.user_can_write_org(organization_id));

-- agent_templates — read-only for everyone.
create policy "Anyone reads agent_templates" on agent_templates
  for select using (true);

-- ---------------------------------------------------------------------------
-- Audit trigger on agents
-- ---------------------------------------------------------------------------
create or replace function public.log_agent_audit()
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
  v_action := lower(tg_op) || '_agent';
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_target := old.id;
  else
    v_org := new.organization_id;
    v_target := new.id;
  end if;
  insert into audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_org, auth.uid(), v_action, 'agent', v_target,
    jsonb_build_object('category', coalesce(new.category, old.category))
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_agents_audit
  after insert or update or delete on agents
  for each row execute function public.log_agent_audit();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_agents_updated_at
  before update on agents
  for each row execute function public.touch_updated_at();
