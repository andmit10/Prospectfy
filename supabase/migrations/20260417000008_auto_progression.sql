-- ============================================================================
-- Auto-progression — tracking links + pipeline rules
-- ============================================================================
-- When a lead clicks a tracked link or replies to a message, the system
-- advances the lead through the pipeline automatically (no human touch).
--
-- Two event sources feed the rule engine:
--   1. CLICK events from `/r/:short_code` (tracking_links + tracking_events)
--   2. INBOUND message events from channel webhooks (classified by LLM)
--
-- The engine walks `pipeline_rules` for the org in priority order and
-- advances the lead's `status_pipeline` + logs the application in
-- `pipeline_rule_applications` (idempotent — a single event never fires
-- the same rule twice on the same lead).
--
-- ╭───────────── SECURITY DESIGN ─────────────╮
-- │ 1. `short_code` is an unguessable 10-char  │
-- │    base62 token (62^10 ≈ 8e17 entropy).    │
-- │ 2. `target_url` validated at creation time │
-- │    (SSRF guard — blocks private IPs).      │
-- │ 3. Bot detection (Outlook link preview,    │
-- │    Googlebot, Slack unfurl) is applied     │
-- │    BEFORE the rule engine fires — known    │
-- │    bots never advance a pipeline.          │
-- │ 4. RLS org-scoped on every table.          │
-- │ 5. `pipeline_rule_applications` is the     │
-- │    immutable audit log of every stage     │
-- │    transition attributed to auto-progress. │
-- │ 6. IP stored as `inet` not text — queried  │
-- │    by network range for fraud detection.   │
-- ╰────────────────────────────────────────────╯
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tracking_links — one row per (campaign_step × lead) or per ad-hoc share
-- ---------------------------------------------------------------------------
create table tracking_links (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  agent_run_id uuid references agent_runs(id) on delete set null,
  short_code text not null unique,               -- base62 10-char token
  target_url text not null,
  label text,                                    -- optional human label ("oferta Q4", "catálogo")
  expires_at timestamptz,                        -- optional TTL
  created_by uuid references profiles(id) on delete set null,
  -- Counters updated by the redirect route — denormalized for fast UI reads.
  click_count integer not null default 0,
  unique_click_count integer not null default 0,
  first_click_at timestamptz,
  last_click_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_tracking_links_org on tracking_links(organization_id);
create index idx_tracking_links_lead on tracking_links(lead_id) where lead_id is not null;
create index idx_tracking_links_campaign on tracking_links(campaign_id) where campaign_id is not null;

-- ---------------------------------------------------------------------------
-- tracking_events — raw event log (click, open, etc.). Partition-ready:
-- keep on a single table for now, promote to monthly partitions once
-- volume exceeds ~10M rows/month.
-- ---------------------------------------------------------------------------
create table tracking_events (
  id uuid default gen_random_uuid() primary key,
  link_id uuid not null references tracking_links(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null check (event_type in ('click','open','unsubscribe')),
  ip inet,
  user_agent text,
  country text,                                   -- 2-letter ISO, filled by redirect route if available
  referer text,
  is_bot boolean not null default false,
  bot_reason text,                                -- populated when is_bot=true
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_tracking_events_link on tracking_events(link_id, created_at desc);
create index idx_tracking_events_lead on tracking_events(lead_id, created_at desc)
  where lead_id is not null;
create index idx_tracking_events_org_created on tracking_events(organization_id, created_at desc);
create index idx_tracking_events_real on tracking_events(link_id) where is_bot = false;

-- ---------------------------------------------------------------------------
-- pipeline_rules — declarative "when X happens → move to stage Y" rules
-- ---------------------------------------------------------------------------
create table pipeline_rules (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  priority integer not null default 100,          -- lower = runs first
  -- Trigger
  trigger_type text not null check (trigger_type in (
    'click','reply_positive','reply_negative','reply_question','reply_unsubscribe',
    'meeting_requested','no_response_days','score_threshold'
  )),
  trigger_config jsonb not null default '{}'::jsonb,
  -- Transition
  from_stage text,                                 -- null = any current stage
  to_stage text not null,
  -- Optional side effects evaluated by the rule engine.
  add_tags text[] not null default '{}'::text[],
  remove_tags text[] not null default '{}'::text[],
  -- Audit
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pipeline_rules_org_enabled
  on pipeline_rules(organization_id, enabled, priority)
  where enabled = true;

-- Seed a small default ruleset per-org on creation — see function below.

-- ---------------------------------------------------------------------------
-- pipeline_rule_applications — immutable ledger (idempotency + audit)
-- ---------------------------------------------------------------------------
create table pipeline_rule_applications (
  id uuid default gen_random_uuid() primary key,
  rule_id uuid not null references pipeline_rules(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  source_event_id uuid,                            -- tracking_events.id OR channel_messages.id
  source_event_type text not null check (source_event_type in ('click','inbound_message','cron','manual')),
  applied_at timestamptz not null default now()
);

create index idx_rule_applications_lead on pipeline_rule_applications(lead_id, applied_at desc);
create index idx_rule_applications_rule on pipeline_rule_applications(rule_id, applied_at desc);
create index idx_rule_applications_org on pipeline_rule_applications(organization_id, applied_at desc);

-- Idempotency: the same event never fires the same rule twice on the same lead.
create unique index idx_rule_applications_dedup
  on pipeline_rule_applications(rule_id, lead_id, source_event_id)
  where source_event_id is not null;

-- ---------------------------------------------------------------------------
-- Default ruleset seeded when a new organization is created.
-- Hooks into the existing `handle_new_user` trigger's bootstrap org path.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_pipeline_rules(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into pipeline_rules (organization_id, name, priority, trigger_type, from_stage, to_stage)
  values
    (p_org_id, 'Clique em link → Respondeu',         100, 'click',              'contatado', 'respondeu'),
    (p_org_id, 'Resposta positiva → Reunião',        90,  'reply_positive',     null,        'reuniao'),
    (p_org_id, 'Resposta negativa → Perdido',        110, 'reply_negative',     null,        'perdido'),
    (p_org_id, 'Pedido de descadastro → Perdido',    10,  'reply_unsubscribe',  null,        'perdido'),
    (p_org_id, 'Pedido de agenda → Reunião',         80,  'meeting_requested',  null,        'reuniao'),
    (p_org_id, 'Score >= 80 → Reunião',              120, 'score_threshold',    null,        'reuniao')
  on conflict do nothing;
end;
$$;

-- Apply to existing orgs that predate this migration.
do $$
declare r record;
begin
  for r in select id from organizations loop
    perform public.seed_default_pipeline_rules(r.id);
  end loop;
end$$;

-- And extend handle_new_user to call the seed for new orgs.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
  v_name text;
  v_org_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  v_slug := coalesce(
    regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g'),
    substring(new.id::text for 8)
  );
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_slug || '-' || substring(md5(random()::text) for 4);
  end loop;
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'company_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'Workspace pessoal'
  );

  insert into public.organizations (slug, name, plan, billing_email)
  values (v_slug, v_name, 'trial', new.email)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role, joined_at)
  values (v_org_id, new.id, 'org_admin', now());

  update public.profiles
     set current_organization_id = v_org_id
   where id = new.id;

  -- Seed pipeline rules for the new org.
  perform public.seed_default_pipeline_rules(v_org_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table tracking_links enable row level security;
alter table tracking_events enable row level security;
alter table pipeline_rules enable row level security;
alter table pipeline_rule_applications enable row level security;

-- tracking_links — members read. Create by writers (or service role when a
-- send_message renders a {link:} template). Admin deletes.
create policy "Org members see tracking links" on tracking_links
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create tracking links" on tracking_links
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org admins delete tracking links" on tracking_links
  for delete using (public.user_is_org_admin(organization_id));

-- tracking_events — members read. Writes only via service role (redirect route).
create policy "Org members see tracking events" on tracking_events
  for select using (organization_id in (select public.user_orgs()));

-- pipeline_rules — members read, writers mutate, admins delete.
create policy "Org members see rules" on pipeline_rules
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create rules" on pipeline_rules
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org writers update rules" on pipeline_rules
  for update using (public.user_can_write_org(organization_id));
create policy "Org admins delete rules" on pipeline_rules
  for delete using (public.user_is_org_admin(organization_id));

-- pipeline_rule_applications — members read (it's the audit log of their
-- pipeline automations). Writes are service-role only.
create policy "Org members see rule applications" on pipeline_rule_applications
  for select using (organization_id in (select public.user_orgs()));

-- ---------------------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------------------
create trigger trg_pipeline_rules_updated_at
  before update on pipeline_rules
  for each row execute function public.touch_updated_at();
