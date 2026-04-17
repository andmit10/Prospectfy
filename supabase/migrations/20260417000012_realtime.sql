-- Enable Supabase Realtime for the two tables the frontend subscribes to:
--   - `interactions` powers the live timeline on /leads/[id] (TimelineView)
--   - `leads` powers the header NotificationBell's reply toast
--
-- Supabase ships a publication named `supabase_realtime` that the Realtime
-- service watches. Adding a table to that publication streams INSERT/UPDATE
-- events to subscribers that RLS permits to see the row.
--
-- `add table if not exists` isn't valid Postgres syntax for publications, so
-- we guard with pg_publication_tables to stay idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'interactions'
  ) then
    execute 'alter publication supabase_realtime add table public.interactions';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    execute 'alter publication supabase_realtime add table public.leads';
  end if;
end
$$;

-- `replica identity full` is only needed when clients want OLD row values
-- (e.g. to detect which column changed). NotificationBell filters purely on
-- NEW.status_pipeline so we can skip the extra WAL overhead for `leads`.
-- Interactions are INSERT-only from the app's perspective, so default
-- replica identity is also fine.
