-- ============================================================================
-- Optimize RLS policies.
-- 1) Wrap auth.uid() in (select ...) so Postgres evaluates it once per query
--    instead of once per row. Fixes Supabase lint 0003 (auth_rls_initplan).
-- 2) Split the over-broad FOR ALL policy on pipeline_members into discrete
--    per-action policies so SELECT is not covered by two overlapping
--    permissive policies. Fixes Supabase lint 0006 (multiple_permissive_policies).
-- Ref: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ============================================================================

-- profiles
drop policy if exists "Users see own profile" on profiles;
drop policy if exists "Users update own profile" on profiles;
create policy "Users see own profile" on profiles
  for select using (id = (select auth.uid()));
create policy "Users update own profile" on profiles
  for update using (id = (select auth.uid()));

-- campaigns
drop policy if exists "Users see own campaigns" on campaigns;
drop policy if exists "Users insert own campaigns" on campaigns;
drop policy if exists "Users update own campaigns" on campaigns;
drop policy if exists "Users delete own campaigns" on campaigns;
create policy "Users see own campaigns" on campaigns
  for select using (user_id = (select auth.uid()));
create policy "Users insert own campaigns" on campaigns
  for insert with check (user_id = (select auth.uid()));
create policy "Users update own campaigns" on campaigns
  for update using (user_id = (select auth.uid()));
create policy "Users delete own campaigns" on campaigns
  for delete using (user_id = (select auth.uid()));

-- leads
drop policy if exists "Users see own leads" on leads;
drop policy if exists "Users insert own leads" on leads;
drop policy if exists "Users update own leads" on leads;
create policy "Users see own leads" on leads
  for select using (user_id = (select auth.uid()));
create policy "Users insert own leads" on leads
  for insert with check (user_id = (select auth.uid()));
create policy "Users update own leads" on leads
  for update using (user_id = (select auth.uid()));

-- cadencia_steps
drop policy if exists "Users see own steps" on cadencia_steps;
drop policy if exists "Users insert own steps" on cadencia_steps;
drop policy if exists "Users update own steps" on cadencia_steps;
drop policy if exists "Users delete own steps" on cadencia_steps;
create policy "Users see own steps" on cadencia_steps
  for select using (
    exists (select 1 from campaigns where id = campaign_id and user_id = (select auth.uid()))
  );
create policy "Users insert own steps" on cadencia_steps
  for insert with check (
    exists (select 1 from campaigns where id = campaign_id and user_id = (select auth.uid()))
  );
create policy "Users update own steps" on cadencia_steps
  for update using (
    exists (select 1 from campaigns where id = campaign_id and user_id = (select auth.uid()))
  );
create policy "Users delete own steps" on cadencia_steps
  for delete using (
    exists (select 1 from campaigns where id = campaign_id and user_id = (select auth.uid()))
  );

-- interactions
drop policy if exists "Users see own interactions" on interactions;
drop policy if exists "Users insert own interactions" on interactions;
create policy "Users see own interactions" on interactions
  for select using (
    exists (select 1 from leads where id = lead_id and user_id = (select auth.uid()))
  );
create policy "Users insert own interactions" on interactions
  for insert with check (
    exists (select 1 from leads where id = lead_id and user_id = (select auth.uid()))
  );

-- agent_queue
drop policy if exists "Users see own queue" on agent_queue;
create policy "Users see own queue" on agent_queue
  for select using (
    exists (select 1 from leads where id = lead_id and user_id = (select auth.uid()))
  );

-- pipelines
drop policy if exists "Users see own or shared pipelines" on pipelines;
drop policy if exists "Users insert own pipelines" on pipelines;
drop policy if exists "Users update own pipelines" on pipelines;
drop policy if exists "Users delete own pipelines" on pipelines;
create policy "Users see own or shared pipelines" on pipelines
  for select using (
    user_id = (select auth.uid()) or is_shared = true
  );
create policy "Users insert own pipelines" on pipelines
  for insert with check (user_id = (select auth.uid()));
create policy "Users update own pipelines" on pipelines
  for update using (user_id = (select auth.uid()));
create policy "Users delete own pipelines" on pipelines
  for delete using (user_id = (select auth.uid()));

-- pipeline_members: drop the overly broad FOR ALL policy and split by action
-- so SELECT is not double-covered by overlapping permissive policies.
drop policy if exists "Members see their memberships" on pipeline_members;
drop policy if exists "Pipeline owners manage members" on pipeline_members;

create policy "Members or owners see memberships" on pipeline_members
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = (select auth.uid())
    )
  );
create policy "Pipeline owners insert members" on pipeline_members
  for insert with check (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = (select auth.uid())
    )
  );
create policy "Pipeline owners update members" on pipeline_members
  for update using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = (select auth.uid())
    )
  );
create policy "Pipeline owners delete members" on pipeline_members
  for delete using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.user_id = (select auth.uid())
    )
  );
