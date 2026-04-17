-- ============================================================================
-- Multi-tenant migration
-- ============================================================================
-- Orbya v2 step 2: backfill organization_id into every user-scoped table and
-- rewrite RLS policies to be org-scoped. After this migration, every customer
-- data row belongs to an organization and access is controlled by org_members
-- rather than user_id.
--
-- The user_id column is KEPT on every table as an "owner/author" audit field.
-- It just stops being the access boundary — organization_id is.
--
-- Safe to run on live data: the migration is idempotent per-row and ALTERs
-- are non-blocking (nullable add → backfill → NOT NULL).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP A — Bootstrap: one personal organization per existing profile
-- ---------------------------------------------------------------------------
-- For every profile without an org yet, create a personal org and make the
-- user its org_admin. Slug derived from the auth.users email (fallback: uuid).
do $$
declare
  r record;
  v_slug text;
  v_name text;
  v_org_id uuid;
begin
  for r in
    select p.id as user_id,
           p.full_name,
           p.company_name,
           u.email
      from profiles p
      left join auth.users u on u.id = p.id
     where not exists (select 1 from org_members om where om.user_id = p.id)
  loop
    -- slug: lowercase email prefix or the first 8 chars of uuid
    v_slug := coalesce(
      regexp_replace(lower(split_part(r.email, '@', 1)), '[^a-z0-9]+', '-', 'g'),
      substring(r.user_id::text for 8)
    );

    -- ensure slug uniqueness
    while exists (select 1 from organizations where slug = v_slug) loop
      v_slug := v_slug || '-' || substring(md5(random()::text) for 4);
    end loop;

    v_name := coalesce(nullif(r.company_name, ''), nullif(r.full_name, ''), 'Workspace pessoal');

    insert into organizations (slug, name, plan, billing_email)
    values (v_slug, v_name, 'trial', r.email)
    returning id into v_org_id;

    insert into org_members (org_id, user_id, role, joined_at)
    values (v_org_id, r.user_id, 'org_admin', now());
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- STEP B — profiles.current_organization_id (active org for the user session)
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists current_organization_id uuid references organizations(id) on delete set null;

-- Set current = the (only) org each user belongs to right now.
update profiles p
   set current_organization_id = (
     select org_id from org_members
      where user_id = p.id
      order by joined_at asc
      limit 1
   )
 where current_organization_id is null;

-- Auto-create personal org when a brand new user signs up.
-- Replaces the simpler `handle_new_user` from init.sql.
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
  -- Create the profile (unchanged behavior).
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  -- Derive a unique slug and a friendly org name.
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

  -- Create the personal organization + membership in one shot.
  insert into public.organizations (slug, name, plan, billing_email)
  values (v_slug, v_name, 'trial', new.email)
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role, joined_at)
  values (v_org_id, new.id, 'org_admin', now());

  update public.profiles
     set current_organization_id = v_org_id
   where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP C — Add organization_id to every user-scoped table (nullable for now)
-- ---------------------------------------------------------------------------
alter table campaigns     add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table leads         add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table pipelines     add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- STEP D — Backfill organization_id from the owning user's personal org
-- ---------------------------------------------------------------------------
update campaigns c
   set organization_id = (
     select org_id from org_members where user_id = c.user_id order by joined_at asc limit 1
   )
 where organization_id is null;

update leads l
   set organization_id = (
     select org_id from org_members where user_id = l.user_id order by joined_at asc limit 1
   )
 where organization_id is null;

update pipelines p
   set organization_id = (
     select org_id from org_members where user_id = p.user_id order by joined_at asc limit 1
   )
 where organization_id is null;

-- ---------------------------------------------------------------------------
-- STEP E — Enforce NOT NULL + indexes
-- ---------------------------------------------------------------------------
alter table campaigns alter column organization_id set not null;
alter table leads     alter column organization_id set not null;
alter table pipelines alter column organization_id set not null;

create index if not exists idx_campaigns_org on campaigns(organization_id);
create index if not exists idx_leads_org on leads(organization_id) where deleted_at is null;
create index if not exists idx_pipelines_org on pipelines(organization_id);

-- Re-scope the leads dedup unique index from user to organization. Different
-- users in the same org should never create the same (whatsapp, empresa_nome)
-- twice, so org-scoping is correct.
drop index if exists idx_leads_dedup;
create unique index idx_leads_dedup on leads(organization_id, whatsapp, empresa_nome)
  where deleted_at is null;

-- Re-scope the "one default pipeline" constraint from user to organization.
drop index if exists idx_pipelines_one_default_per_user;
create unique index idx_pipelines_one_default_per_org
  on pipelines(organization_id)
  where is_default = true;

-- Update the trigger that enforces single default pipeline to be org-scoped.
create or replace function enforce_single_default_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_default = true then
    update pipelines
      set is_default = false, updated_at = now()
      where organization_id = new.organization_id
        and id <> new.id
        and is_default = true;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP F — RLS rewrite: drop user-scoped policies, create org-scoped
-- ---------------------------------------------------------------------------

-- profiles: the user owns their profile row (unchanged). No org scoping here.
-- (kept as-is from the earlier migrations)

-- campaigns
drop policy if exists "Users see own campaigns" on campaigns;
drop policy if exists "Users insert own campaigns" on campaigns;
drop policy if exists "Users update own campaigns" on campaigns;
drop policy if exists "Users delete own campaigns" on campaigns;

create policy "Org members see campaigns" on campaigns
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create campaigns" on campaigns
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org writers update campaigns" on campaigns
  for update using (public.user_can_write_org(organization_id));
create policy "Org admins delete campaigns" on campaigns
  for delete using (public.user_is_org_admin(organization_id));

-- leads
drop policy if exists "Users see own leads" on leads;
drop policy if exists "Users insert own leads" on leads;
drop policy if exists "Users update own leads" on leads;

create policy "Org members see leads" on leads
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create leads" on leads
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org writers update leads" on leads
  for update using (public.user_can_write_org(organization_id));
create policy "Org admins delete leads" on leads
  for delete using (public.user_is_org_admin(organization_id));

-- cadencia_steps (scoped via campaign.organization_id)
drop policy if exists "Users see own steps" on cadencia_steps;
drop policy if exists "Users insert own steps" on cadencia_steps;
drop policy if exists "Users update own steps" on cadencia_steps;
drop policy if exists "Users delete own steps" on cadencia_steps;

create policy "Org members see steps" on cadencia_steps
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id
        and c.organization_id in (select public.user_orgs())
    )
  );
create policy "Org writers create steps" on cadencia_steps
  for insert with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id
        and public.user_can_write_org(c.organization_id)
    )
  );
create policy "Org writers update steps" on cadencia_steps
  for update using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id
        and public.user_can_write_org(c.organization_id)
    )
  );
create policy "Org writers delete steps" on cadencia_steps
  for delete using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id
        and public.user_can_write_org(c.organization_id)
    )
  );

-- interactions (scoped via lead.organization_id)
drop policy if exists "Users see own interactions" on interactions;
drop policy if exists "Users insert own interactions" on interactions;

create policy "Org members see interactions" on interactions
  for select using (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and l.organization_id in (select public.user_orgs())
    )
  );
create policy "Org writers create interactions" on interactions
  for insert with check (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and public.user_can_write_org(l.organization_id)
    )
  );

-- agent_queue (scoped via lead.organization_id)
drop policy if exists "Users see own queue" on agent_queue;

create policy "Org members see queue" on agent_queue
  for select using (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and l.organization_id in (select public.user_orgs())
    )
  );

-- pipelines
drop policy if exists "Users see own or shared pipelines" on pipelines;
drop policy if exists "Users insert own pipelines" on pipelines;
drop policy if exists "Users update own pipelines" on pipelines;
drop policy if exists "Users delete own pipelines" on pipelines;

create policy "Org members see pipelines" on pipelines
  for select using (organization_id in (select public.user_orgs()));
create policy "Org writers create pipelines" on pipelines
  for insert with check (public.user_can_write_org(organization_id));
create policy "Org writers update pipelines" on pipelines
  for update using (public.user_can_write_org(organization_id));
create policy "Org admins delete pipelines" on pipelines
  for delete using (public.user_is_org_admin(organization_id));

-- pipeline_members is deprecated in favor of org_members + pipeline visibility,
-- but we keep it for existing share-invite flows. Re-scope its policies so any
-- org member can read memberships of pipelines in their org.
drop policy if exists "Members or owners see memberships" on pipeline_members;
drop policy if exists "Pipeline owners insert members" on pipeline_members;
drop policy if exists "Pipeline owners update members" on pipeline_members;
drop policy if exists "Pipeline owners delete members" on pipeline_members;

create policy "Org members see pipeline members" on pipeline_members
  for select using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id
        and p.organization_id in (select public.user_orgs())
    )
  );
create policy "Org writers insert pipeline members" on pipeline_members
  for insert with check (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id
        and public.user_can_write_org(p.organization_id)
    )
  );
create policy "Org writers update pipeline members" on pipeline_members
  for update using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id
        and public.user_can_write_org(p.organization_id)
    )
  );
create policy "Org writers delete pipeline members" on pipeline_members
  for delete using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id
        and public.user_can_write_org(p.organization_id)
    )
  );
