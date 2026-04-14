# TODO — Fase 1 MVP

## Semana 1-2: Infraestrutura

- [x] Init Next.js 14+ com TypeScript + Tailwind + shadcn/ui
- [ ] Setup Supabase: criar projeto, configurar env vars  ← **PRÓXIMO: preencher .env.local com chaves reais**
- [ ] Rodar migrations: profiles, leads, campaigns, cadencia_steps, interactions, agent_queue
- [x] Setup tRPC com Next.js App Router
- [x] Auth: magic link + Google OAuth (Supabase Auth)
- [x] Layout base: sidebar, header, auth guard
- [x] Page: /dashboard (placeholder com métricas fake)
- [x] Page: /settings (perfil, Directfy API key, Calendly URL)

## Semana 3-4: Core do produto

- [x] Page: /leads com DataTable (sort, filter, pagination)
- [x] Feature: importação CSV/XLSX com mapeamento de colunas
- [x] Feature: validação de WhatsApp (formato BR)
- [x] Feature: deduplicação por whatsapp + empresa
- [x] Page: /leads/[id] com dados + timeline vazia
- [x] Page: /campaigns com lista
- [x] Page: /campaigns/new — wizard (nome → leads → steps → ativar)
- [x] Feature: editor de cadência com steps drag-and-drop
- [x] Feature: variáveis no template ({{decisor_nome}}, etc.)
- [x] Feature: preview de mensagem com dados reais

## Semana 5-6: Agente + Directfy

- [x] Service: Directfy API client (enviar msg, receber webhook)
- [x] Service: Claude API agent com tool_use (4 tools)
- [x] Worker: BullMQ consumer para processar agent_queue
- [x] Cron: a cada hora, enfileirar leads com step pendente
- [x] Feature: log de decisão do agente na timeline
- [x] Feature: pausa automática quando lead responde
- [x] Feature: lead scoring automático por tipo de interação
- [x] Webhook: Directfy → atualizar status de mensagem (entregue/lido/respondido)

## Semana 7-8: Polish + lançamento

- [x] Page: /dashboard com métricas reais (leads, envios, respostas, reuniões)
- [x] Feature: export CSV de leads
- [x] Feature: Kanban pipeline básico (arrastar leads entre estágios)
- [x] Integration: Stripe checkout (plano R$197/mês)
- [x] Feature: onboarding wizard (3 steps: perfil → Directfy key → importar leads)
- [x] Page: /login e /register com branding Orbya
- [ ] Deploy: Vercel (frontend) + Railway (worker)  ← **PRÓXIMO após env vars**
- [ ] Test: 10 clientes beta

## Checklist de deploy

### 1. Supabase
- [ ] Criar projeto em supabase.com
- [ ] Copiar URL + anon key + service_role key para .env.local (e Vercel env vars)
- [ ] Rodar migration: colar `supabase/migrations/20260414000001_init.sql` no SQL Editor
- [ ] Habilitar Auth providers: Email (magic link) + Google OAuth
- [ ] Configurar Redirect URL no Supabase: `https://seu-dominio.vercel.app/auth/callback`
- [ ] Habilitar Realtime nas tabelas: interactions, leads, agent_queue

### 2. Stripe
- [ ] Criar produto "Orbya Pro" — R$197/mês (BRL, recorrente)
- [ ] Copiar price_id para STRIPE_PRICE_ID env var
- [ ] Copiar secret key (sk_live_...) para STRIPE_SECRET_KEY
- [ ] Configurar webhook: `https://seu-dominio.vercel.app/api/webhooks/stripe`
  - Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
- [ ] Copiar webhook secret (whsec_...) para STRIPE_WEBHOOK_SECRET
- [ ] Configurar Customer Portal em Stripe Dashboard

### 3. Vercel (frontend)
- [ ] `vercel --prod` ou conectar repo no dashboard
- [ ] Adicionar todas env vars (copiar de .env.local, adicionar STRIPE_PRICE_ID)
- [ ] Verificar que cron `/api/cron/enqueue` está ativo (vercel.json já configurado)

### 4. Railway (worker — opcional no início)
- [ ] Criar serviço Railway, conectar repo
- [ ] Set start command: `npx tsx workers/index.ts`
- [ ] Adicionar env vars: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, REDIS_URL, DIRECTFY_API_URL
- [ ] Provisionar Redis no Railway (Add Service → Redis)
- [ ] Copiar REDIS_URL para env vars do worker e do Vercel

### 5. Directfy
- [ ] Configurar webhook no painel Directfy: `https://seu-dominio.vercel.app/api/webhooks/directfy`
- [ ] Copiar API key para DIRECTFY_API_KEY (configurado por usuário no /settings)

## Notas
- Foco: entregar valor rápido, iterar depois
- Não otimizar prematuramente
- Se algo pode ser feito com uma query SQL simples, não abstraia
- Worker Railway é opcional no MVP — o Vercel cron enfileira, mas sem o worker os jobs ficam pendentes na DB
