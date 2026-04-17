-- ============================================================================
-- Multi-pipeline support
-- ============================================================================
-- Each user can own multiple pipelines. Pipelines can be private (is_shared=false)
-- or shared across the account (is_shared=true). Future: pipeline_members table
-- lets us invite other users into a specific pipeline.
-- ============================================================================

-- pipelines
create table pipelines (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  nome text not null,
  descricao text,
  is_default boolean default false,
  is_shared boolean default false,
  stages jsonb default '["novo","contatado","respondeu","reuniao","convertido","perdido"]'::jsonb not null,
  color text default '#2B88D8',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_pipelines_user on pipelines(user_id);
create unique index idx_pipelines_one_default_per_user
  on pipelines(user_id)
  where is_default = true;

alter table pipelines enable row level security;

create policy "Users see own or shared pipelines" on pipelines
  for select using (
    user_id = auth.uid() or is_shared = true
  );
create policy "Users insert own pipelines" on pipelines
  for insert with check (user_id = auth.uid());
create policy "Users update own pipelines" on pipelines
  for update using (user_id = auth.uid());
create policy "Users delete own pipelines" on pipelines
  for delete using (user_id = auth.uid());

-- pipeline_members (future: invite other users into a pipeline)
create table pipeline_members (
  pipeline_id uuid references pipelines(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('owner','member','viewer')),
  created_at timestamptz default now(),
  primary key (pipeline_id, user_id)
);

create index idx_pipeline_members_user on pipeline_members(user_id);

alter table pipeline_members enable row level security;

create policy "Members see their memberships" on pipeline_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = auth.uid()
    )
  );
create policy "Pipeline owners manage members" on pipeline_members
  for all using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = auth.uid()
    )
  );

-- leads.pipeline_id: allow assigning a lead to a specific pipeline.
-- Legacy leads keep pipeline_id = null and are shown in the default pipeline.
alter table leads
  add column pipeline_id uuid references pipelines(id) on delete set null;

create index idx_leads_pipeline on leads(pipeline_id) where deleted_at is null;

-- Ensure only one default pipeline per user: when a pipeline is marked default,
-- reset the previous default.
create or replace function enforce_single_default_pipeline()
returns trigger as $$
begin
  if NEW.is_default = true then
    update pipelines
      set is_default = false, updated_at = now()
      where user_id = NEW.user_id
        and id <> NEW.id
        and is_default = true;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_pipelines_single_default
  before insert or update of is_default on pipelines
  for each row execute function enforce_single_default_pipeline();

-- Backfill: create a default pipeline for every existing user that has leads.
insert into pipelines (user_id, nome, descricao, is_default, is_shared)
select distinct l.user_id, 'Pipeline Principal', 'Pipeline padrão criado automaticamente', true, false
from leads l
where not exists (
  select 1 from pipelines p where p.user_id = l.user_id and p.is_default = true
);

-- Attach existing leads to the owner's default pipeline
update leads l
  set pipeline_id = p.id
from pipelines p
where p.user_id = l.user_id
  and p.is_default = true
  and l.pipeline_id is null;
