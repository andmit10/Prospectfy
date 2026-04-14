-- profiles (extends auth.users)
create table profiles (
  id uuid references auth.users primary key,
  full_name text not null,
  company_name text,
  avatar_url text,
  phone text,
  plan text default 'trial' check (plan in ('trial','starter','pro','agency')),
  directfy_api_key text,
  calendly_url text,
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users see own profile" on profiles
  for select using (id = auth.uid());
create policy "Users update own profile" on profiles
  for update using (id = auth.uid());

-- Auto-create profile on sign up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- campaigns
create table campaigns (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  nome text not null,
  descricao text,
  status text default 'rascunho' check (status in ('rascunho','ativa','pausada','concluida')),
  meta_reunioes integer,
  total_leads integer default 0,
  total_enviados integer default 0,
  total_respondidos integer default 0,
  total_reunioes integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_campaigns_user on campaigns(user_id);

alter table campaigns enable row level security;
create policy "Users see own campaigns" on campaigns
  for select using (user_id = auth.uid());
create policy "Users insert own campaigns" on campaigns
  for insert with check (user_id = auth.uid());
create policy "Users update own campaigns" on campaigns
  for update using (user_id = auth.uid());
create policy "Users delete own campaigns" on campaigns
  for delete using (user_id = auth.uid());

-- leads
create table leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  campaign_id uuid references campaigns(id),
  empresa_nome text not null,
  cnpj text,
  segmento text,
  cidade text,
  estado text,
  decisor_nome text not null,
  decisor_cargo text,
  email text,
  email_status text default 'unknown' check (email_status in ('valid','catch_all','invalid','unknown')),
  linkedin_url text,
  telefone text,
  whatsapp text not null,
  lead_score integer default 0,
  fonte text default 'manual' check (fonte in ('csv_import','manual','google_maps','api')),
  status_pipeline text default 'novo' check (status_pipeline in ('novo','contatado','respondeu','reuniao','convertido','perdido')),
  tags text[] default '{}',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index idx_leads_user on leads(user_id) where deleted_at is null;
create index idx_leads_campaign on leads(campaign_id) where deleted_at is null;
create index idx_leads_status on leads(status_pipeline) where deleted_at is null;
create index idx_leads_score on leads(lead_score desc) where deleted_at is null;
create unique index idx_leads_dedup on leads(user_id, whatsapp, empresa_nome) where deleted_at is null;

alter table leads enable row level security;
create policy "Users see own leads" on leads
  for select using (user_id = auth.uid());
create policy "Users insert own leads" on leads
  for insert with check (user_id = auth.uid());
create policy "Users update own leads" on leads
  for update using (user_id = auth.uid());

-- cadencia_steps
create table cadencia_steps (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade not null,
  step_order integer not null,
  canal text default 'whatsapp' check (canal in ('whatsapp','email','linkedin','landing_page')),
  delay_hours integer default 24,
  mensagem_template text not null,
  tipo_mensagem text default 'texto' check (tipo_mensagem in ('texto','imagem','documento','audio')),
  ativo boolean default true,
  created_at timestamptz default now(),
  unique(campaign_id, step_order)
);

create index idx_steps_campaign on cadencia_steps(campaign_id);

alter table cadencia_steps enable row level security;
create policy "Users see own steps" on cadencia_steps
  for select using (
    exists (select 1 from campaigns where id = campaign_id and user_id = auth.uid())
  );
create policy "Users insert own steps" on cadencia_steps
  for insert with check (
    exists (select 1 from campaigns where id = campaign_id and user_id = auth.uid())
  );
create policy "Users update own steps" on cadencia_steps
  for update using (
    exists (select 1 from campaigns where id = campaign_id and user_id = auth.uid())
  );
create policy "Users delete own steps" on cadencia_steps
  for delete using (
    exists (select 1 from campaigns where id = campaign_id and user_id = auth.uid())
  );

-- interactions
create table interactions (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id) not null,
  campaign_id uuid references campaigns(id),
  step_id uuid references cadencia_steps(id),
  canal text not null check (canal in ('whatsapp','email','linkedin','landing_page')),
  tipo text not null check (tipo in ('enviado','entregue','lido','respondido','clicado','bounce','erro')),
  mensagem_enviada text,
  resposta_lead text,
  agent_reasoning text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_interactions_lead on interactions(lead_id);
create index idx_interactions_campaign on interactions(campaign_id);
create index idx_interactions_created on interactions(created_at desc);

alter table interactions enable row level security;
create policy "Users see own interactions" on interactions
  for select using (
    exists (select 1 from leads where id = lead_id and user_id = auth.uid())
  );
create policy "Users insert own interactions" on interactions
  for insert with check (
    exists (select 1 from leads where id = lead_id and user_id = auth.uid())
  );

-- agent_queue
create table agent_queue (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references leads(id) not null,
  campaign_id uuid references campaigns(id) not null,
  step_id uuid references cadencia_steps(id) not null,
  scheduled_at timestamptz not null,
  status text default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
  attempts integer default 0,
  last_error text,
  created_at timestamptz default now(),
  processed_at timestamptz
);

create index idx_queue_pending on agent_queue(scheduled_at) where status = 'pending';
create index idx_queue_lead on agent_queue(lead_id);

alter table agent_queue enable row level security;
create policy "Users see own queue" on agent_queue
  for select using (
    exists (select 1 from leads where id = lead_id and user_id = auth.uid())
  );

-- update_lead_score function
create or replace function update_lead_score(
  p_lead_id uuid,
  p_points integer,
  p_reason text
) returns void as $$
begin
  update leads
  set lead_score = lead_score + p_points,
      updated_at = now()
  where id = p_lead_id;

  -- Auto-move to 'reuniao' if score >= 80
  update leads
  set status_pipeline = 'reuniao'
  where id = p_lead_id
    and lead_score >= 80
    and status_pipeline not in ('reuniao','convertido','perdido');
end;
$$ language plpgsql security definer;

-- campaign counter trigger
create or replace function update_campaign_counters()
returns trigger as $$
begin
  update campaigns set
    total_enviados = (
      select count(*) from interactions
      where campaign_id = NEW.campaign_id and tipo = 'enviado'
    ),
    total_respondidos = (
      select count(distinct lead_id) from interactions
      where campaign_id = NEW.campaign_id and tipo = 'respondido'
    ),
    updated_at = now()
  where id = NEW.campaign_id;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger trg_interaction_counters
  after insert on interactions
  for each row execute function update_campaign_counters();
