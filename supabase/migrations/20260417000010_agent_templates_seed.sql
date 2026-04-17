-- ============================================================================
-- Expand the agent template catalog + auto-seed every org with a starter pack
-- ============================================================================
-- Two outcomes:
--   1. `agent_templates` gets 2 new entries (enriquecedor-cnpj +
--      mensagem-whatsapp) so the catalog renders like the design reference.
--   2. `seed_default_agents(org_id)` clones 5 active agents into every new
--      org. handle_new_user is extended to call it, and every existing org
--      that currently has zero agents is backfilled.
--
-- Definitions are intentionally minimal but PASS Zod validation (version=1,
-- goal, trigger, ≥1 step, tools/channels/kb_ids arrays). The runtime won't
-- reject these on the first run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New templates
-- ---------------------------------------------------------------------------
insert into agent_templates (id, name, description, category, definition, icon_name, tags) values
  (
    'enriquecedor-cnpj',
    'Enriquecedor de CNPJ',
    'Busca dados da Receita, sócios, faturamento estimado e setor via CNPJ.',
    'enrichment',
    jsonb_build_object(
      'version', 1,
      'goal', 'Enriquecer lead com dados oficiais do CNPJ e sinais de mercado',
      'trigger', jsonb_build_object('type','manual'),
      'tools', jsonb_build_array('enrich_lead','update_lead_score'),
      'channels', jsonb_build_array(),
      'kb_ids', jsonb_build_array(),
      'steps', jsonb_build_array(
        jsonb_build_object(
          'type','tool_call',
          'tool','enrich_lead',
          'args', jsonb_build_object('fields', jsonb_build_array('segmento','porte','dor','diferencial')),
          'output_var','enrichment'
        ),
        jsonb_build_object(
          'type','tool_call',
          'tool','update_lead_score',
          'args', jsonb_build_object('points', 10, 'reason','lead enriquecido automaticamente')
        )
      )
    ),
    'Search',
    array['cnpj','enrichment','receita']
  ),
  (
    'mensagem-whatsapp-personalizada',
    'Mensagem WhatsApp personalizada',
    'Gera abordagem no WhatsApp adaptada ao setor, cargo e dor do prospect.',
    'outreach',
    jsonb_build_object(
      'version', 1,
      'goal', 'Escrever e enviar primeira mensagem personalizada no WhatsApp',
      'trigger', jsonb_build_object('type','manual'),
      'tools', jsonb_build_array('send_message','update_lead_score'),
      'channels', jsonb_build_array('whatsapp'),
      'kb_ids', jsonb_build_array(),
      'steps', jsonb_build_array(
        jsonb_build_object(
          'type','llm_task',
          'task','sequence',
          'user','Escreva uma mensagem de WhatsApp para {lead.decisor_nome} ({lead.decisor_cargo}) da empresa {lead.empresa_nome}. Segmento: {lead.segmento}. Tom: profissional mas casual. Máximo 3 parágrafos. Inclua um CTA claro.',
          'output_var','msg'
        ),
        jsonb_build_object(
          'type','tool_call',
          'tool','send_message',
          'args', jsonb_build_object('channel','whatsapp','content_var','msg.message')
        ),
        jsonb_build_object(
          'type','tool_call',
          'tool','update_lead_score',
          'args', jsonb_build_object('points',5,'reason','primeiro contato via WhatsApp')
        )
      )
    ),
    'MessageCircle',
    array['outreach','whatsapp','personalizado']
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  definition = excluded.definition;

-- Also upgrade the existing templates' definitions to the minimal-valid shape
-- so cloning produces runnable agents on day one.
update agent_templates set definition = jsonb_build_object(
  'version', 1,
  'goal', 'Prospectar leads B2B dentro do ICP e iniciar conversa no WhatsApp',
  'trigger', jsonb_build_object('type','manual'),
  'tools', jsonb_build_array('search_knowledge','send_message','update_lead_score'),
  'channels', jsonb_build_array('whatsapp'),
  'kb_ids', jsonb_build_array(),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'type','llm_task',
      'task','sequence',
      'user','Escreva uma mensagem inicial de prospecção para {lead.decisor_nome} ({lead.decisor_cargo}) da {lead.empresa_nome}. Adapte ao segmento {lead.segmento}. Use WhatsApp informal mas profissional. Máx 3 parágrafos com CTA.',
      'output_var','msg'
    ),
    jsonb_build_object(
      'type','tool_call',
      'tool','send_message',
      'args', jsonb_build_object('channel','whatsapp','content_var','msg.message')
    ),
    jsonb_build_object(
      'type','tool_call',
      'tool','update_lead_score',
      'args', jsonb_build_object('points',5,'reason','first touch')
    )
  )
) where id = 'prospector-b2b';

update agent_templates set definition = jsonb_build_object(
  'version', 1,
  'goal', 'Qualificar lead usando BANT a partir das interações disponíveis',
  'trigger', jsonb_build_object('type','response_received'),
  'tools', jsonb_build_array('classify_text','update_lead_score','move_pipeline_stage'),
  'channels', jsonb_build_array(),
  'kb_ids', jsonb_build_array(),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'type','llm_task',
      'task','classify',
      'user','Classifique BANT (Budget/Authority/Need/Timing) da resposta do lead {lead.decisor_nome}. Responda JSON {score_0_100, authority, need, timing}.',
      'output_var','bant'
    ),
    jsonb_build_object(
      'type','tool_call',
      'tool','update_lead_score',
      'args', jsonb_build_object('points',15,'reason','BANT qualification')
    )
  )
) where id = 'bant-qualifier';

update agent_templates set definition = jsonb_build_object(
  'version', 1,
  'goal', 'Reaquecer leads que pararam de responder há 7+ dias',
  'trigger', jsonb_build_object('type','cron','cron_expression','0 10 * * 1-5','timezone','America/Sao_Paulo'),
  'tools', jsonb_build_array('search_knowledge','send_message','update_lead_score'),
  'channels', jsonb_build_array('whatsapp','email'),
  'kb_ids', jsonb_build_array(),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'type','llm_task',
      'task','sequence',
      'user','Escreva um follow-up para {lead.decisor_nome} da {lead.empresa_nome} que parou de responder. Tom leve, traga um ângulo novo. Máx 2 parágrafos.',
      'output_var','followup'
    ),
    jsonb_build_object(
      'type','tool_call',
      'tool','send_message',
      'args', jsonb_build_object('channel','whatsapp','content_var','followup.message')
    )
  )
) where id = 'reengage-cold';

update agent_templates set definition = jsonb_build_object(
  'version', 1,
  'goal', 'Atender respostas de lead no WhatsApp, qualificar e agendar reunião',
  'trigger', jsonb_build_object('type','response_received','channel','whatsapp'),
  'tools', jsonb_build_array('classify_text','search_knowledge','send_message','schedule_meeting','move_pipeline_stage'),
  'channels', jsonb_build_array('whatsapp'),
  'kb_ids', jsonb_build_array(),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'type','llm_task',
      'task','classify',
      'user','Classifique a intenção da resposta do lead. Categorias: positive/negative/question/schedule_request/unsubscribe.',
      'output_var','intent'
    ),
    jsonb_build_object(
      'type','conditional',
      'expression','intent.intent == "schedule_request"',
      'then', jsonb_build_array(
        jsonb_build_object('type','tool_call','tool','schedule_meeting','args', jsonb_build_object())
      ),
      'else', jsonb_build_array(
        jsonb_build_object(
          'type','llm_task',
          'task','sequence',
          'user','Responda ao lead {lead.decisor_nome} respeitando o histórico. Tom conversacional.',
          'output_var','reply'
        ),
        jsonb_build_object(
          'type','tool_call',
          'tool','send_message',
          'args', jsonb_build_object('channel','whatsapp','content_var','reply.message')
        )
      )
    )
  )
) where id = 'sdr-24-7';

update agent_templates set definition = jsonb_build_object(
  'version', 1,
  'goal', 'Gerar sumário diário com objeções recorrentes e próximos passos',
  'trigger', jsonb_build_object('type','cron','cron_expression','0 18 * * 1-5','timezone','America/Sao_Paulo'),
  'tools', jsonb_build_array('classify_text'),
  'channels', jsonb_build_array(),
  'kb_ids', jsonb_build_array(),
  'steps', jsonb_build_array(
    jsonb_build_object(
      'type','llm_task',
      'task','chat',
      'user','Analise conversas do dia do lead {lead.decisor_nome} e aponte objeções + próximos passos.',
      'output_var','analysis'
    )
  )
) where id = 'conversation-analyst';

-- ---------------------------------------------------------------------------
-- seed_default_agents — clones a starter pack into an org.
-- Idempotent: only inserts agents that don't exist yet (by slug).
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_agents(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  v_slug text;
  v_status text;
begin
  for t in
    select id, name, description, category, definition, icon_name
      from agent_templates
     where enabled = true
       and id in ('prospector-b2b','bant-qualifier','mensagem-whatsapp-personalizada','sdr-24-7','conversation-analyst')
  loop
    v_slug := regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);

    -- SDR starts as draft to match the reference UX (it needs more setup).
    v_status := case when t.id = 'sdr-24-7' then 'draft' else 'active' end;

    -- Skip if this org already has an agent with this slug.
    if exists (
      select 1 from agents
       where organization_id = p_org_id and slug = v_slug
    ) then
      continue;
    end if;

    insert into agents (
      organization_id, name, slug, description, category, status,
      definition, tools, channels, kb_ids,
      trigger_type, trigger_config,
      cron_expression, cron_timezone,
      created_from_template
    )
    values (
      p_org_id,
      t.name,
      v_slug,
      t.description,
      t.category,
      v_status,
      t.definition,
      array(select jsonb_array_elements_text(coalesce(t.definition->'tools','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(t.definition->'channels','[]'::jsonb))),
      array(select (jsonb_array_elements_text(coalesce(t.definition->'kb_ids','[]'::jsonb)))::uuid),
      t.definition->'trigger'->>'type',
      coalesce(t.definition->'trigger', '{}'::jsonb),
      t.definition->'trigger'->>'cron_expression',
      coalesce(t.definition->'trigger'->>'timezone', 'America/Sao_Paulo'),
      t.id
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend handle_new_user to seed agents on new orgs
-- ---------------------------------------------------------------------------
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

  perform public.seed_default_pipeline_rules(v_org_id);
  perform public.seed_default_agents(v_org_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill — every existing org with zero agents gets the starter pack.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select o.id
      from organizations o
     where not exists (select 1 from agents a where a.organization_id = o.id)
  loop
    perform public.seed_default_agents(r.id);
  end loop;
end$$;
