-- ============================================================================
-- Channel Dispatcher — multi-provider messaging (WhatsApp, Email, LinkedIn, Instagram)
-- ============================================================================
-- Every outbound/inbound message flows through the dispatcher:
--   1. Caller picks a channel + lead_id + payload.
--   2. Dispatcher resolves the org's active `channel_integrations` row for
--      that channel (respects `is_default` when multiple providers exist).
--   3. Provider adapter sends via its native API.
--   4. Result is persisted in `channel_messages` with `external_message_id`
--      for later webhook correlation.
--   5. Inbound webhooks hit `/api/webhooks/channels/[provider]` which calls
--      back into the dispatcher to mark status + trigger auto-progression.
--
-- ╭───────────── SECURITY DESIGN ─────────────╮
-- │                                            │
-- │ 1. `channel_integrations.config` is a      │
-- │    jsonb holding credentials. Values are   │
-- │    APP-LAYER ENCRYPTED with AES-256-GCM    │
-- │    before insert; RLS + encryption is a    │
-- │    defense-in-depth pair.                  │
-- │ 2. RLS org-scoped on every table + admin   │
-- │    gate on writes (tRPC adminProcedure).   │
-- │ 3. Webhook secrets stored as `webhook_secret` │
-- │    column, rotated independently of API keys. │
-- │ 4. `status='error'` flips after N failures │
-- │    in a row; dispatcher refuses to send    │
-- │    from a broken integration.              │
-- │ 5. SSRF protection for generic-webhook:    │
-- │    URL validation happens in the provider  │
-- │    adapter (lib/channels/providers/...).   │
-- │ 6. `external_message_id` unique per        │
-- │    (org, integration) — natural idempotency │
-- │    key for webhook retries.                │
-- │ 7. `audit_log` trigger on channel_integrations │
-- │    captures every credential change.       │
-- │                                            │
-- ╰────────────────────────────────────────────╯
-- ============================================================================

-- ---------------------------------------------------------------------------
-- channel_integrations — per-org, per-channel, per-provider rows.
-- ---------------------------------------------------------------------------
-- Multiple rows per (org, channel) are allowed so a customer can configure
-- e.g. Directfy as default + Evolution as backup + a generic webhook for a
-- specific campaign. `is_default` picks the one the dispatcher uses when the
-- caller doesn't specify an integration_id.
create table channel_integrations (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  channel text not null
    check (channel in ('whatsapp','email','linkedin','instagram','sms')),
  provider text not null,                     -- 'directfy' | 'evolution' | 'zapi' | 'resend' | 'sendgrid' | 'smtp' | 'unipile' | 'meta_instagram' | 'generic_webhook'
  display_name text not null,                 -- user-facing label ("Directfy principal", "Resend - produção")
  config jsonb not null default '{}'::jsonb,  -- app-encrypted blob: { iv, tag, ciphertext }
  status text not null default 'active'
    check (status in ('active','error','disconnected')),
  last_error text,
  last_error_at timestamptz,
  consecutive_failures integer not null default 0,
  is_default boolean not null default false,
  connected_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_channel_integrations_org_channel
  on channel_integrations(organization_id, channel);
create index idx_channel_integrations_active
  on channel_integrations(organization_id, channel)
  where status = 'active';

-- Only one default per (org, channel). Enforced by a partial unique index.
create unique index idx_channel_integrations_one_default
  on channel_integrations(organization_id, channel)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- channel_messages — canonical message history across every channel.
-- ---------------------------------------------------------------------------
-- This table replaces the outbound half of `interactions` over time. The old
-- `interactions` table stays for agent reasoning + non-message events.
-- Channel webhooks update the status columns as delivery proceeds.
create table channel_messages (
  id uuid default gen_random_uuid() primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  integration_id uuid not null references channel_integrations(id) on delete cascade,
  channel text not null
    check (channel in ('whatsapp','email','linkedin','instagram','sms')),
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  direction text not null check (direction in ('outbound','inbound')),
  external_message_id text,                   -- provider-side id for webhook correlation
  thread_id text,                             -- conversation thread (email Message-Id chain, WhatsApp phone, LinkedIn convo id)
  subject text,                               -- email only
  content text,                               -- sanitized, not raw HTML (no scripts)
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','replied','bounced','failed')),
  status_detail text,                         -- last provider detail / failure reason
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Org-scoped index for dashboards + lead timelines.
create index idx_channel_messages_org_created on channel_messages(organization_id, created_at desc);
create index idx_channel_messages_lead on channel_messages(lead_id, created_at desc)
  where lead_id is not null;
create index idx_channel_messages_integration on channel_messages(integration_id, created_at desc);
create index idx_channel_messages_campaign on channel_messages(campaign_id)
  where campaign_id is not null;
-- Idempotency: same external id from the same integration → same row.
create unique index idx_channel_messages_external_dedup
  on channel_messages(integration_id, external_message_id)
  where external_message_id is not null;

-- ---------------------------------------------------------------------------
-- cadencia_steps — expand `canal` check to include instagram + sms.
-- ---------------------------------------------------------------------------
alter table cadencia_steps
  drop constraint if exists cadencia_steps_canal_check;

alter table cadencia_steps
  add constraint cadencia_steps_canal_check
  check (canal in ('whatsapp','email','linkedin','instagram','sms','landing_page'));

-- Also loosen the `interactions.canal` check so imports from `channel_messages`
-- don't violate it when we mirror events back for the timeline.
alter table interactions
  drop constraint if exists interactions_canal_check;

alter table interactions
  add constraint interactions_canal_check
  check (canal in ('whatsapp','email','linkedin','instagram','sms','landing_page'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table channel_integrations enable row level security;
alter table channel_messages enable row level security;

-- channel_integrations: members read (to show status in UI). Admin writes.
create policy "Org members see integrations" on channel_integrations
  for select using (organization_id in (select public.user_orgs()));

create policy "Org admins create integrations" on channel_integrations
  for insert with check (public.user_is_org_admin(organization_id));

create policy "Org admins update integrations" on channel_integrations
  for update using (public.user_is_org_admin(organization_id));

create policy "Org admins delete integrations" on channel_integrations
  for delete using (public.user_is_org_admin(organization_id));

-- channel_messages: members read their org's messages. Writes are server-side
-- only (service role in dispatcher + webhook), so no insert/update policy
-- for authenticated is needed.
create policy "Org members see channel messages" on channel_messages
  for select using (organization_id in (select public.user_orgs()));

-- ---------------------------------------------------------------------------
-- Audit trigger on channel_integrations — every credential change logged.
-- ---------------------------------------------------------------------------
create or replace function public.log_channel_integration_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  v_action := lower(tg_op) || '_channel_integration';
  insert into audit_log (org_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    v_action,
    'channel_integration',
    coalesce(new.id, old.id),
    jsonb_build_object(
      'channel', coalesce(new.channel, old.channel),
      'provider', coalesce(new.provider, old.provider)
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_channel_integrations_audit
  after insert or update or delete on channel_integrations
  for each row execute function public.log_channel_integration_audit();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_channel_integrations_updated_at
  before update on channel_integrations
  for each row execute function public.touch_updated_at();

create trigger trg_channel_messages_updated_at
  before update on channel_messages
  for each row execute function public.touch_updated_at();
