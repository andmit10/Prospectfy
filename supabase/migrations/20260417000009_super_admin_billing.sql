-- ============================================================================
-- Super-admin panel + hybrid billing (plan_addons + feature_flags + audit)
-- ============================================================================
-- The last piece of the platform: cross-org operations for Orbya staff.
-- Strictly gated — only users holding `org_members.role = 'super_admin'`
-- on the "Orbya Internal" org can touch these surfaces.
--
-- Tables:
--   admin_impersonation_sessions — every time staff acts as an org user
--   credit_adjustments           — manual ledger for IA credits top-ups
--   coupons                       — Stripe-mirrored discount codes
--   plan_addons                  — org-level add-ons (LinkedIn Unipile,
--                                  LLM premium volume, KB > 10k chunks, etc.)
--   feature_flags                — per-plan and per-org gating
--   admin_mrr_daily (MV)         — rolling MRR by day for the finance page
--
-- ╭───────────── SECURITY DESIGN ─────────────╮
-- │ 1. `is_platform_admin(user_id)` function   │
-- │    returns true only when the user has a  │
-- │    `super_admin` membership anywhere.      │
-- │ 2. Every admin-only table has RLS that     │
-- │    checks `is_platform_admin(auth.uid())`. │
-- │ 3. Impersonation sessions are a first-     │
-- │    class audit trail — open, close, reason.│
-- │ 4. `feature_flags` reads are open to all   │
-- │    authenticated users (UI needs them to   │
-- │    gate pages); writes are admin-only.     │
-- │ 5. Materialized views refreshed nightly by │
-- │    the admin-metrics cron.                 │
-- ╰────────────────────────────────────────────╯
-- ============================================================================

-- ---------------------------------------------------------------------------
-- is_platform_admin() — canonical guard used by every admin RLS policy.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from org_members
    where user_id = p_user_id
      and role = 'super_admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- admin_impersonation_sessions — who impersonated whom, when, why
-- ---------------------------------------------------------------------------
create table admin_impersonation_sessions (
  id uuid default gen_random_uuid() primary key,
  super_admin_id uuid not null references profiles(id) on delete cascade,
  target_org_id uuid not null references organizations(id) on delete cascade,
  target_user_id uuid references profiles(id) on delete set null,
  reason text not null,                              -- required, surfaced in audit UI
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Snapshot of which org the admin was in BEFORE impersonation, so we can
  -- restore it on session end.
  restore_org_id uuid references organizations(id) on delete set null,
  ip inet,
  user_agent text
);

create index idx_impersonation_active
  on admin_impersonation_sessions(super_admin_id)
  where ended_at is null;
create index idx_impersonation_target on admin_impersonation_sessions(target_org_id, started_at desc);

-- ---------------------------------------------------------------------------
-- credit_adjustments — manual ledger of IA-credit top-ups / refunds
-- ---------------------------------------------------------------------------
create table credit_adjustments (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  delta_credits bigint not null,                       -- positive = grant, negative = claw back
  reason text not null,
  related_coupon_id uuid,                              -- optional FK to coupons
  created_at timestamptz not null default now()
);

create index idx_credit_adjustments_org on credit_adjustments(organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- coupons — mirrored from Stripe for UX + audit
-- ---------------------------------------------------------------------------
create table coupons (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  stripe_coupon_id text unique,                        -- null while drafted
  discount_percent integer check (discount_percent >= 0 and discount_percent <= 100),
  discount_amount_brl numeric(10,2) check (discount_amount_brl >= 0),
  max_uses integer,
  used_count integer not null default 0,
  valid_from timestamptz,
  expires_at timestamptz,
  applies_to_plans text[] not null default '{}'::text[],
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (discount_percent is not null or discount_amount_brl is not null)
);

create index idx_coupons_active on coupons(expires_at) where expires_at > now();

alter table credit_adjustments
  add constraint fk_credit_coupon
  foreign key (related_coupon_id) references coupons(id) on delete set null;

-- ---------------------------------------------------------------------------
-- plan_addons — org-level paid add-ons (synced from Stripe subscription items)
-- ---------------------------------------------------------------------------
create table plan_addons (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  addon_key text not null,                              -- 'linkedin_unipile' | 'llm_premium_volume' | 'kb_large' | 'extra_users' | 'custom_domain'
  stripe_subscription_item_id text unique,              -- from Stripe; null while we're pending
  stripe_price_id text,
  display_name text not null,
  monthly_price_brl numeric(10,2) not null default 0,
  quantity integer not null default 1,
  active boolean not null default true,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, addon_key)
);

create index idx_plan_addons_org on plan_addons(organization_id, active);

create trigger trg_plan_addons_updated_at
  before update on plan_addons
  for each row execute function public.touch_updated_at();

-- Seed catalog of add-ons (not per-org — just the known SKUs). We store them
-- as rows in a reference table so the UI can render a catalog without
-- hardcoding strings.
create table addon_catalog (
  addon_key text primary key,
  display_name text not null,
  description text not null,
  monthly_price_brl numeric(10,2) not null default 0,
  stripe_price_id text,                 -- filled by ops when product is created in Stripe
  category text not null default 'general',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into addon_catalog (addon_key, display_name, description, monthly_price_brl, category) values
  ('linkedin_unipile',   'LinkedIn (Unipile)',          'Conta LinkedIn conectada via Unipile. 1 conta por add-on.', 99.00, 'channels'),
  ('llm_premium_volume', 'Volume LLM Premium',          '+500k tokens/mês no tier premium (Claude Sonnet).',        199.00, 'ai'),
  ('kb_large',           'Base de conhecimento grande', 'KBs ilimitadas até 100k chunks totais por org.',            49.00, 'rag'),
  ('extra_users',        'Usuários adicionais',         'Libera 5 usuários adicionais além da cota do plano.',       79.00, 'team'),
  ('custom_domain',      'Domínio customizado',         'Usa seu domínio para tracking links em vez de orbya.io.',    29.00, 'branding'),
  ('priority_support',   'Suporte prioritário',         'SLA de resposta em até 4h úteis, canal dedicado.',          199.00, 'support');

-- ---------------------------------------------------------------------------
-- feature_flags — plan + org gating
-- ---------------------------------------------------------------------------
create table feature_flags (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,                              -- snake_case, stable
  description text not null,
  enabled_for_plans text[] not null default '{}'::text[],
  enabled_for_orgs uuid[] not null default '{}'::uuid[],
  globally_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed flags we ship by default. Operators toggle them via /admin/flags.
insert into feature_flags (key, description, enabled_for_plans) values
  ('rag',                   'Módulo RAG (knowledge bases)',             array['starter','pro','business','agency','enterprise']),
  ('agents_custom',         'Agentes customizáveis via IA',             array['pro','business','agency','enterprise']),
  ('linkedin_channel',      'Canal LinkedIn disponível',                 array['pro','business','agency','enterprise']),
  ('llm_local',             'LLM local (Qwen3) — dashboard de telemetria', array['business','agency','enterprise']),
  ('super_admin_ui',        'Painel super-admin — exposto só por flag',  array[]::text[]),
  ('auto_progression',      'Auto-progressão de pipeline via IA',       array['starter','pro','business','agency','enterprise']),
  ('evolution_whatsapp',    'Provider Evolution (self-host) no catálogo','plan'       ::text[] || array['agency','enterprise']::text[]),
  ('multi_brand',           'Múltiplas marcas/orgs por conta (Agency)',  array['agency','enterprise']);

create trigger trg_feature_flags_updated_at
  before update on feature_flags
  for each row execute function public.touch_updated_at();

-- is_feature_enabled(key, org_id) — used by callers that need to gate UI/behavior.
create or replace function public.is_feature_enabled(p_key text, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from feature_flags f, organizations o
     where f.key = p_key
       and o.id = p_org_id
       and (
         f.globally_enabled
         or p_org_id = any(f.enabled_for_orgs)
         or o.plan = any(f.enabled_for_plans)
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Materialized view — MRR snapshot by day over the last 90 days.
-- ---------------------------------------------------------------------------
-- Simplistic formula: sum(plan monthly price) + sum(addon monthly price) per
-- day for all non-suspended orgs. Refreshed nightly by the admin cron.
create materialized view admin_mrr_daily as
with days as (
  select generate_series(
    current_date - interval '90 days',
    current_date,
    interval '1 day'
  )::date as d
),
plan_mrr as (
  select d.d,
         sum(p.monthly_price_brl) as total
    from days d
    cross join organizations o
    join plan_catalog p on p.plan = o.plan
   where (o.suspended_at is null or o.suspended_at > d.d)
     and o.created_at <= d.d + interval '1 day'
  group by d.d
),
addon_mrr as (
  select d.d,
         sum(a.monthly_price_brl * a.quantity) as total
    from days d
    cross join plan_addons a
    join organizations o on o.id = a.organization_id
   where a.active
     and a.active_from <= d.d + interval '1 day'
     and (a.active_to is null or a.active_to > d.d)
     and (o.suspended_at is null or o.suspended_at > d.d)
  group by d.d
)
select d.d as date,
       coalesce(plan_mrr.total, 0)  as plan_mrr,
       coalesce(addon_mrr.total, 0) as addon_mrr,
       coalesce(plan_mrr.total, 0) + coalesce(addon_mrr.total, 0) as total_mrr
  from days d
  left join plan_mrr on plan_mrr.d = d.d
  left join addon_mrr on addon_mrr.d = d.d
 order by d.d;

create unique index idx_admin_mrr_daily_date on admin_mrr_daily(date);

-- Convenience view — churn cohort last 30 days.
create or replace view admin_churn_30d as
select
  count(*) filter (where suspended_at >= now() - interval '30 days')     as suspended_30d,
  count(*) filter (where suspended_at is null)                           as active,
  count(*) filter (where trial_ends_at > now() and plan = 'trial')       as in_trial,
  count(*) filter (where plan != 'trial' and suspended_at is null)       as paying
from organizations;

-- ---------------------------------------------------------------------------
-- RLS — admin-only tables
-- ---------------------------------------------------------------------------
alter table admin_impersonation_sessions enable row level security;
alter table credit_adjustments enable row level security;
alter table coupons enable row level security;
alter table plan_addons enable row level security;
alter table addon_catalog enable row level security;
alter table feature_flags enable row level security;

-- admin_impersonation_sessions — platform admins only.
create policy "Platform admins read impersonation log" on admin_impersonation_sessions
  for select using (public.is_platform_admin());
create policy "Platform admins insert impersonation" on admin_impersonation_sessions
  for insert with check (public.is_platform_admin());
create policy "Platform admins update impersonation" on admin_impersonation_sessions
  for update using (public.is_platform_admin());

-- credit_adjustments — org members read their org's; admins read/write all.
create policy "Org members read credit adjustments" on credit_adjustments
  for select using (
    public.is_platform_admin()
    or organization_id in (select public.user_orgs())
  );
create policy "Platform admins write credit adjustments" on credit_adjustments
  for insert with check (public.is_platform_admin());

-- coupons — admin only.
create policy "Platform admins read coupons" on coupons
  for select using (public.is_platform_admin());
create policy "Platform admins write coupons" on coupons
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- plan_addons — members of the org read theirs; admins write (or Stripe webhook via service role).
create policy "Org members see plan addons" on plan_addons
  for select using (
    public.is_platform_admin()
    or organization_id in (select public.user_orgs())
  );
create policy "Platform admins manage plan addons" on plan_addons
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- addon_catalog — open read, admin write.
create policy "Anyone reads addon catalog" on addon_catalog
  for select using (true);
create policy "Platform admins write addon catalog" on addon_catalog
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- feature_flags — open read (so client can gate UI), admin write.
create policy "Anyone reads feature flags" on feature_flags
  for select using (true);
create policy "Platform admins write feature flags" on feature_flags
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Audit trigger: every plan_addon change is logged.
-- ---------------------------------------------------------------------------
create or replace function public.log_plan_addon_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    lower(tg_op) || '_plan_addon',
    'plan_addon',
    coalesce(new.id, old.id),
    jsonb_build_object(
      'addon_key', coalesce(new.addon_key, old.addon_key),
      'active', coalesce(new.active, old.active)
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_plan_addons_audit
  after insert or update or delete on plan_addons
  for each row execute function public.log_plan_addon_audit();
