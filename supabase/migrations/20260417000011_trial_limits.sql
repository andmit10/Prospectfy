-- Trial policy: 7 days + 50 AI-generated leads per organization.
--   - `trial_ends_at` defaults to created_at + 7 days for new orgs, backfilled
--      to now() + 7 days for existing orgs still on 'trial'.
--   - `leads_generated_count` is incremented by /api/generate-leads on success.
--   - `increment_leads_generated(org_id, delta)` is a SECURITY DEFINER helper
--      the API calls atomically so the counter never drifts.
--   - Enforcement is done at the application layer (middleware + API) so that
--      exceeding the quota returns a friendly error instead of a raw RLS denial.

alter table organizations
  add column if not exists trial_ends_at timestamptz,
  add column if not exists leads_generated_count integer not null default 0;

-- Backfill: orgs still on 'trial' get 7 more days from now.
update organizations
  set trial_ends_at = now() + interval '7 days'
  where plan = 'trial' and trial_ends_at is null;

-- New trial orgs: default to created_at + 7 days.
create or replace function set_default_trial_ends_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.plan = 'trial' and new.trial_ends_at is null then
    new.trial_ends_at = coalesce(new.created_at, now()) + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_default_trial_ends_at on organizations;
create trigger trg_set_default_trial_ends_at
  before insert on organizations
  for each row execute function set_default_trial_ends_at();

-- Atomic increment helper. Returns the new count so callers can check the
-- quota in a single round-trip.
create or replace function increment_leads_generated(p_org_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  update organizations
    set leads_generated_count = leads_generated_count + p_delta,
        updated_at = now()
    where id = p_org_id
    returning leads_generated_count into v_new_count;
  return coalesce(v_new_count, 0);
end;
$$;

grant execute on function increment_leads_generated(uuid, integer) to authenticated, service_role;
