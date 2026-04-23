# Ativafy — Mapa de pendências (master list)

> Atualizado em 2026-04-17 por Claude. Esse é o documento canônico do que falta.
> Lances novos vão pro fim das seções; concluídos viram `[x]`.

---

## 0. URGENTE / Ação humana imediata

- [ ] **Rotacionar `GLOBAL_API_KEY` do Evolution Go** (vazou no chat ao mandar screenshot do HostGator). Trocar a env `AUTHENTICATION_API_KEY` no `.env` do VPS, atualizar `EVOLUTION_GO_SHARED_GLOBAL_API_KEY` no Vercel + `.env.local`.
- [x] Decidir **domínio**: `ativafy.com.br` (já registrado na Hostinger) + URL Vercel temporária `prospectfy-u2a3.vercel.app` enquanto DNS não aponta.
- [ ] Conta **Stripe**: criar produto BR + configurar Customer Portal (necessário pra cobrar).
- [ ] Conta **Unipile** (se quiser LinkedIn): criar trial em unipile.com.

---

## 1. Foundation — DONE

- [x] Next.js 14+ + TypeScript + Tailwind + shadcn/ui
- [x] tRPC com Next.js App Router
- [x] Supabase (auth + DB + RLS + Realtime)
- [x] Multi-tenant: organizations, org_members, super_admin role
- [x] Auth: magic link + Google OAuth + email/senha
- [x] 18 migrations aplicadas (incl. trial_limits, realtime, channel_integrations.metadata, leads_generated_limit override)
- [x] Sentry + Redis-backed rate limiting
- [x] Layout, sidebar, header, theme switcher (default = light)

## 2. Estado atual das orgs

- [x] **Labfy** (slug: labfy) — plano `enterprise`, sem trial. Super-admins: Anderson + Victor.
- [x] **Sankhya** — plano `trial`, com `leads_generated_limit = 200` (override). Org-admin: Victor.

## 3. Product modules — DONE

- [x] /leads (DataTable + sort/filter/pagination + bulk edit + export CSV + Kanban)
- [x] Importação CSV/XLSX com mapeamento + dedup
- [x] /campaigns + wizard (nome → leads → steps → ativar)
- [x] Editor de cadência drag-and-drop com variáveis e preview
- [x] /leads/[id] timeline + detail
- [x] /dashboard com métricas reais
- [x] /onboarding wizard (3 steps)
- [x] /settings (perfil + integrações + billing)
- [x] Mobile lead cards, error boundaries, empty states
- [x] Notificações realtime (NotificationBell)
- [x] Pipeline rules + auto-progression

## 4. WhatsApp via Evolution Go — Onda 1 DONE

- [x] Provider `evolution_go` (send + parseWebhook + validateConfig + ignoreTls)
- [x] Provider registrado + adicionado ao `PROVIDER_CATALOG`
- [x] Integração da Labfy seedada manualmente (instância `Labfy` conectada no número 31 98477-0691)
- [x] Smoke test de envio: chegou no 31 99311-8427 ✅
- [x] **Backend de provisão automática**:
  - `channel_integrations.metadata jsonb` (QR code base64, qr_updated_at, disconnected_at)
  - Env vars `EVOLUTION_GO_SHARED_BASE_URL` + `_GLOBAL_API_KEY` + `_IGNORE_TLS`
  - Helpers `evolution-go-admin.ts` (createInstance / connectInstance / disconnectInstance / deleteInstance)
  - tRPC: `channels.provisionWhatsapp`, `getWhatsappQR`, `disconnectWhatsapp`
  - Webhook lifecycle handler (QRCode → grava base64; Connected → status=active; LoggedOut → status=disconnected + timestamp)
  - Plan limit check usa `plan_catalog.max_channels`

## 5. WhatsApp via Evolution Go — Onda 2 PENDING (UI)

- [ ] Botão **"Conectar novo WhatsApp"** em `/settings/integrations` (ou `/onboarding`)
- [ ] Modal/página com:
  - Input "Nome da instância" (cliente nomeia, validação a-zA-Z0-9_-)
  - Input "Display name"
  - Botão "Criar e conectar"
  - Após criar: poll `getWhatsappQR` cada 2s, renderiza QR base64
  - Status "aguardando scan" → "conectado ✅" (auto-fecha modal)
- [ ] Botão "Desconectar" em cada integração existente
- [ ] Indicador visual de status (active/disconnected/error) com timestamp
- [ ] Tooltip explicando: "Trial: 1 número. Pro: 4 números." etc.

## 6. WhatsApp via Evolution Go — Onda 3 PENDING (Cron)

- [ ] Endpoint `/api/cron/cleanup-whatsapp-instances`:
  - Busca `channel_integrations` com `status='disconnected' AND metadata->>'disconnected_at' < now() - 7 days`
  - Pra cada: chama `deleteInstance(instance_id)` + delete row
  - Audit log
- [ ] Adicionar ao GitHub Actions cron (junto com o cron de enqueue) — diário às 3am

## 7. Webhook inbound — PENDING (depende de deploy)

- [ ] Após deploy, configurar `webhookUrl` da instância existente da Labfy:
  - `POST /instance/connect` com `webhookUrl: https://<dominio>/api/webhooks/channels/whatsapp/evolution_go?integration=0e95b008-fbbf-4e1f-b5e9-c6fb09045a5f`
- [ ] Teste E2E: você responde no WhatsApp → vê na timeline do lead em real-time
- [ ] Validar que pipeline rules disparam no inbound

## 8. LinkedIn (Unipile) — PENDING

Provider `unipile` já está implementado em `src/lib/channels/providers/linkedin/unipile.ts` e catalogado.

- [ ] Criar conta Unipile (~US$ 40/mês por conta conectada)
- [ ] Conectar tua conta LinkedIn via OAuth hospedado pela Unipile
- [ ] Pegar credenciais (DSN + apiKey + accountId) e configurar via `/settings/integrations`
- [ ] Smoke test: enviar connection request via Orbya
- [ ] Configurar webhook Unipile pra receber respostas

## 9. Stripe — PENDING

Código já implementado em `src/server/routers/stripe.ts` + `src/app/api/webhooks/stripe/route.ts`.

- [ ] Criar conta Stripe BR
- [ ] Criar produtos: Starter (R$ 197), Pro (R$ 397), Business (R$ 797), Agency (R$ 1.497)
- [ ] Pegar `price_id` de cada um, salvar em env vars (`STRIPE_PRICE_STARTER`, `_PRO`, etc.) — ou em `plan_catalog.stripe_price_id` (verificar se já existe)
- [ ] Habilitar Customer Portal no Stripe Dashboard
- [ ] Configurar webhook Stripe → `/api/webhooks/stripe`:
  - Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Copiar `whsec_...` para `STRIPE_WEBHOOK_SECRET`
- [ ] Adicionar CTA "Fale com vendas" no modal de upgrade pra plano Enterprise (não tem checkout)

## 10. Deploy — PENDING

### Vercel (frontend + API + cron)
- [ ] `vercel link` ou conectar repo no dashboard
- [ ] Adicionar todas env vars de `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `ANTHROPIC_API_KEY`, `AI_SERVICE_KEY`
  - `NEXT_PUBLIC_APP_URL` (com domínio de prod)
  - `CRON_SECRET`, `CHANNEL_ENCRYPTION_KEY`
  - `EVOLUTION_GO_SHARED_BASE_URL`, `_GLOBAL_API_KEY`, `_IGNORE_TLS`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (depois)
- [ ] Verificar GitHub Actions cron (`enqueue` agora em `.github/workflows/`)
- [ ] Custom domain: configurar `ativafy.com.br` no Vercel (DNS + SSL) e atualizar `NEXT_PUBLIC_APP_URL` + Supabase Site URL + Redirect URLs + Google OAuth redirect URI
- [ ] Forçar HTTPS (default Vercel)

### Worker BullMQ — opcional MVP
- [ ] Decisão: subir Railway agora ou rodar workers via Vercel Cron + Inngest depois?
  - Por ora cron do Vercel cobre o fluxo básico (enfileira), mas sem worker os jobs ficam parados.
  - Recomendado: **adiar** — usar `process.nextTick` síncrono no `/api/cron/enqueue` enquanto volume é baixo.

## 11. Bugs conhecidos / tech debt

- [ ] **Race condition trial gate**: Victor gerou 94 leads num trial limitado a 50 (chamadas paralelas passam todas no gate antes do increment). Fix: trocar gate por check-and-increment dentro do `increment_leads_generated` SQL function.
- [ ] **Inconsistência texto**: badge mostra "14 dias" mas trial é 7 dias. `plan_catalog.name = 'Trial (14 dias)'` desatualizado. Atualizar pra "Trial (7 dias)".
- [ ] **Inconsistência limites**: `plan_catalog.max_leads_month = 200` no trial mas código defaultava pra 50. Já parcialmente resolvido (a lógica honra plano), mas confirmar que o seed do plan_catalog reflete a regra atual.
- [ ] **CTA Enterprise faltando**: modal "Ver planos" não tem CTA "Fale com vendas" (Enterprise é negociado, não tem checkout).
- [ ] **Cert auto-assinado VPS**: aceitável pra MVP, mas pra produção comprar/instalar cert (Let's Encrypt + domínio do VPS, ex: `evolution.labfy.com.br`).
- [ ] **Safeguard super_admin**: orgs com membro super_admin nunca deveriam ficar em trial automaticamente. Adicionar bypass no `computeTrialStatus` (já recomendado, não implementado).
- [ ] **Sankhya = tenant ou test data?**: Victor é org_admin lá com 94 leads gerados. Decidir se é cliente real ou apaga.

## 12. Decisões pendentes (não-bloqueantes)

- [ ] Provider default no UI: deixa Directfy primeiro? Reordena Evolution Go pra primeiro? Esconde Directfy?
- [ ] Quanto cobrar pelo Enterprise? Hoje `monthly_price_brl = 0` (negociado).
- [ ] Plano Trial vai mesmo subir pra 200 leads (igual Sankhya tem agora) ou continua 50? Tem implicação direta de custo Anthropic.
- [ ] Quem dá suporte ao cliente (chat, email)? Vai precisar de algum widget tipo Crisp/Intercom?

## 13. Pós-lançamento (10 clientes beta)

- [ ] Onboarding por vídeo gravado
- [ ] Canal de feedback (Slack? form?)
- [ ] Dashboard interno de uso (já existe `/admin`, mas refinar métricas de ativação)
- [ ] Métricas de conversão trial → pago (rastrear no admin)

---

## Histórico (DONE consolidado por sprint)

### Sprint 1 (semanas 1-2): Infraestrutura — DONE
Next, tRPC, Supabase, Auth, layout, /dashboard placeholder, /settings.

### Sprint 2 (semanas 3-4): Core — DONE
Leads, importação, dedup, /campaigns, wizard, cadência editor, variáveis, preview.

### Sprint 3 (semanas 5-6): Agente + WhatsApp — DONE
Service Directfy, agente Claude com 4 tools, BullMQ worker, cron enqueue, log de decisão, lead scoring, webhook Directfy.

### Sprint 4 (semanas 7-8): Polish — DONE
Métricas reais, export CSV, Kanban pipeline, Stripe checkout (código), onboarding wizard, /login + /register branding.

### Sprint 5 (em andamento): Multi-tenant + WhatsApp Evolution Go
Multi-tenant migration, super_admin, plan management, Evolution Go provider, provisioning backend.
