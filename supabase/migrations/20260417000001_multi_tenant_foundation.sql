-- ============================================================================
-- Multi-tenant foundation
-- ============================================================================
-- Orbya v2 step 1: introduce first-class organizations so multiple users can
-- collaborate inside the same account. Keeps the existing single-tenant data
-- untouched — Step 2 (next migration) backfills `organization_id` into every
-- existing row and rewrites RLS to be org-scoped.
--
-- This migration only CREATES new tables. It is safe to run on a live DB.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  name text not null,
  plan text not null default 'trial'
    check (plan in ('trial','starter','pro','business','enterprise','agency')),
  stripe_customer_id text,
  stripe_subscription_id text,
  billing_email text,
  suspended_at timestamptz,
  suspended_reason text,
  trial_ends_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_plan on organizations(plan) where suspended_at is null;
create index idx_organizations_stripe_customer on organizations(stripe_customer_id)
  where stripe_customer_id is not null;

-- ---------------------------------------------------------------------------
-- org_members (user <-> organization + role)
-- ---------------------------------------------------------------------------
-- Roles:
--   super_admin — platform operators (Orbya staff). Set only on the
--                 internal "Orbya Internal" org. Never appears on customer orgs.
--   org_admin   — manage organization (billing, members, integrations).
--   member      — normal user: CRUD leads, campaigns, run agents.
--   viewer      — read-only.
create table org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('super_admin','org_admin','member','viewer')),
  invited_by uuid references profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index idx_org_members_user on org_members(user_id);
create index idx_org_members_role on org_members(org_id, role);

-- ---------------------------------------------------------------------------
-- plan_catalog (seed-only; no user writes)
-- ---------------------------------------------------------------------------
-- One row per plan defining limits and feature flags. Changed by migrations,
-- not by users. RLS denies all writes.
create table plan_catalog (
  plan text primary key
    check (plan in ('trial','starter','pro','business','enterprise','agency')),
  name text not null,
  monthly_price_brl numeric(10,2) not null default 0,
  max_users integer not null default 1,
  max_leads_month integer not null default 100,
  max_ai_tokens_month bigint not null default 100000,
  max_channels integer not null default 1,
  max_knowledge_bases integer not null default 1,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Seed the catalog. Prices are placeholders — tune when Stripe products exist.
insert into plan_catalog (plan, name, monthly_price_brl, max_users, max_leads_month, max_ai_tokens_month, max_channels, max_knowledge_bases, features) values
  ('trial',      'Trial (14 dias)',       0,    1,   200,    200000, 1, 1,  '{"rag": false, "linkedin": false, "agents_custom": false}'::jsonb),
  ('starter',    'Starter',              197,   1,  1000,   1000000, 2, 2,  '{"rag": true,  "linkedin": false, "agents_custom": false}'::jsonb),
  ('pro',        'Pro',                  397,   3,  5000,   5000000, 4, 5,  '{"rag": true,  "linkedin": true,  "agents_custom": true}'::jsonb),
  ('business',   'Business',             797,   8, 15000,  15000000, 4, 15, '{"rag": true,  "linkedin": true,  "agents_custom": true,  "priority_support": true}'::jsonb),
  ('agency',     'Agency',              1497,  20, 50000,  50000000, 4, 50, '{"rag": true,  "linkedin": true,  "agents_custom": true,  "multi_brand": true, "priority_support": true}'::jsonb),
  ('enterprise', 'Enterprise',             0, 100, 500000, 500000000,4, 200,'{"rag": true,  "linkedin": true,  "agents_custom": true,  "multi_brand": true, "sso": true, "dedicated_support": true}'::jsonb);

-- ---------------------------------------------------------------------------
-- usage_quotas (rolling monthly counters per org)
-- ---------------------------------------------------------------------------
create table usage_quotas (
  org_id uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  leads_generated integer not null default 0,
  ai_tokens_used bigint not null default 0,
  messages_sent integer not null default 0,
  knowledge_chunks integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, period_start)
);

create index idx_usage_quotas_period on usage_quotas(period_start desc);

-- ---------------------------------------------------------------------------
-- audit_log (org-scoped action history; partition later if volume grows)
-- ---------------------------------------------------------------------------
create table audit_log (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_org_created on audit_log(org_id, created_at desc);
create index idx_audit_log_actor on audit_log(actor_user_id, created_at desc)
  where actor_user_id is not null;

-- ---------------------------------------------------------------------------
-- Helper: list orgs the current user is a member of
-- ---------------------------------------------------------------------------
-- Used inside RLS policies. SECURITY DEFINER so the inner select on
-- org_members is not blocked by org_members' own RLS.
-- `stable` marks the result as deterministic within a single statement, which
-- lets Postgres cache the value across many-row evaluations.
create or replace function public.user_orgs()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from org_members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Helper: check whether current user has a writer role on an org
-- ---------------------------------------------------------------------------
create or replace function public.user_can_write_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('super_admin','org_admin','member')
  )
$$;

-- ---------------------------------------------------------------------------
-- Helper: check whether current user is org_admin (or super_admin)
-- ---------------------------------------------------------------------------
create or replace function public.user_is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('super_admin','org_admin')
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS — new tables
-- ---------------------------------------------------------------------------

-- organizations: members can read their orgs; only admins can update.
alter table organizations enable row level security;

create policy "Members see their orgs" on organizations
  for select using (id in (select public.user_orgs()));

create policy "Org admins update their orgs" on organizations
  for update using (public.user_is_org_admin(id));

-- Insert handled by server-side create flow (tRPC uses service role or checks
-- auth.uid() against the authenticated user). Expose a minimal policy so a
-- signed-in user can create an org and immediately get listed in it by the
-- companion org_members insert (done in the same transaction).
create policy "Authenticated users create orgs" on organizations
  for insert with check (auth.uid() is not null);

-- org_members: members see memberships of their orgs; admins manage them.
alter table org_members enable row level security;

create policy "Members see memberships in their orgs" on org_members
  for select using (org_id in (select public.user_orgs()));

create policy "Org admins insert members" on org_members
  for insert with check (
    public.user_is_org_admin(org_id)
    -- Allow bootstrap: first member of a brand new org
    or (user_id = auth.uid() and not exists (
      select 1 from org_members om where om.org_id = org_members.org_id
    ))
  );

create policy "Org admins update members" on org_members
  for update using (public.user_is_org_admin(org_id));

create policy "Org admins remove members" on org_members
  for delete using (public.user_is_org_admin(org_id));

-- plan_catalog: everyone reads, nobody writes (seeded by migrations).
alter table plan_catalog enable row level security;
create policy "Anyone reads plan catalog" on plan_catalog
  for select using (true);

-- usage_quotas: org members read; writes only by service role (via trigger or server).
alter table usage_quotas enable row level security;
create policy "Org members read usage" on usage_quotas
  for select using (org_id in (select public.user_orgs()));

-- audit_log: org admins read; writes only by server.
alter table audit_log enable row level security;
create policy "Org admins read audit log" on audit_log
  for select using (org_id is null or public.user_is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse pattern from existing migrations)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function public.touch_updated_at();

create trigger trg_usage_quotas_updated_at
  before update on usage_quotas
  for each row execute function public.touch_updated_at();
