# TODO — Fase 1 MVP

## Semana 1-2: Infraestrutura

- [ ] Init Next.js 14+ com TypeScript + Tailwind + shadcn/ui
- [ ] Setup Supabase: criar projeto, configurar env vars
- [ ] Rodar migrations: profiles, leads, campaigns, cadencia_steps, interactions, agent_queue
- [ ] Setup tRPC com Next.js App Router
- [ ] Auth: magic link + Google OAuth (Supabase Auth)
- [ ] Layout base: sidebar, header, auth guard
- [ ] Page: /dashboard (placeholder com métricas fake)
- [ ] Page: /settings (perfil, Directfy API key, Calendly URL)

## Semana 3-4: Core do produto

- [ ] Page: /leads com DataTable (sort, filter, pagination)
- [ ] Feature: importação CSV/XLSX com mapeamento de colunas
- [ ] Feature: validação de WhatsApp (formato BR)
- [ ] Feature: deduplicação por whatsapp + empresa
- [ ] Page: /leads/[id] com dados + timeline vazia
- [ ] Page: /campaigns com lista
- [ ] Page: /campaigns/new — wizard (nome → leads → steps → ativar)
- [ ] Feature: editor de cadência com steps drag-and-drop
- [ ] Feature: variáveis no template ({{decisor_nome}}, etc.)
- [ ] Feature: preview de mensagem com dados reais

## Semana 5-6: Agente + Directfy

- [ ] Service: Directfy API client (enviar msg, receber webhook)
- [ ] Service: Claude API agent com tool_use (4 tools)
- [ ] Worker: BullMQ consumer para processar agent_queue
- [ ] Cron: a cada hora, enfileirar leads com step pendente
- [ ] Feature: log de decisão do agente na timeline
- [ ] Feature: pausa automática quando lead responde
- [ ] Feature: lead scoring automático por tipo de interação
- [ ] Webhook: Directfy → atualizar status de mensagem (entregue/lido/respondido)

## Semana 7-8: Polish + lançamento

- [ ] Page: /dashboard com métricas reais (leads, envios, respostas, reuniões)
- [ ] Feature: export CSV de leads
- [ ] Feature: Kanban pipeline básico (arrastar leads entre estágios)
- [ ] Integration: Stripe checkout (plano R$197/mês)
- [ ] Feature: onboarding wizard (3 steps: perfil → Directfy key → importar leads)
- [ ] Page: /login e /register com branding Orbya
- [ ] Deploy: Vercel (frontend) + Railway (worker)
- [ ] Test: 10 clientes beta

## Notas
- Foco: entregar valor rápido, iterar depois
- Não otimizar prematuramente
- Se algo pode ser feito com uma query SQL simples, não abstraia
