# Smoke Test — Critérios de aceite do MVP (PRD §5)

Checklist manual a rodar antes de cobrar o primeiro cliente. Cada item aponta
para o fluxo e o lugar de verificação automatizada, quando aplicável.

**Status do build automatizado:** `npm run typecheck`, `npm run lint`, `npx vitest run`
passando no CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).
31 testes cobrindo logger, Directfy HMAC, mapeamento de planos Stripe,
schemas de tool do agente, renderização de template e cálculo de trial.

---

## Checklist

| # | Critério PRD | Status | Como verificar |
|---|---|---|---|
| 1 | Usuário cria conta via magic link | Manual | `/login` → Entrar com link mágico → abrir link no e-mail → confirma `/auth/confirm` redirecionando para `/onboarding`. |
| 2 | Usuário importa CSV com 500 leads em < 30s | Auto+Manual | Endpoint retorna `durationMs` em [src/app/api/import-leads/route.ts](../src/app/api/import-leads/route.ts); validar em `/leads → Importar CSV` com 500 linhas. Limite por requisição: 1000. |
| 3 | Usuário cria campanha com 5 steps de WhatsApp | Manual | `/campaigns/new` → wizard → 5 steps → salvar. Preview ao vivo em [src/components/campaigns/message-preview.tsx](../src/components/campaigns/message-preview.tsx). |
| 4 | Agente personaliza e envia mensagens via Directfy | Manual | Requer `DIRECTFY_API_URL` + API key configurados. Disparar trigger manual no `/agent/[id]`, validar que [src/agents/tools/send-whatsapp.ts](../src/agents/tools/send-whatsapp.ts) foi chamado. |
| 5 | Interações aparecem na timeline do lead em tempo real | Auto (visual) | `/leads/[id]` mostra `Ao vivo` quando subscrição do Supabase Realtime conecta. Enablement da tabela `interactions` em Realtime é pré-requisito. Código: [src/components/leads/timeline-view.tsx](../src/components/leads/timeline-view.tsx). |
| 6 | Lead score atualiza automaticamente | Manual | Tool `update_lead_score` do agente → conferir `lead_score` mudando em `/leads/[id]`. |
| 7 | Dashboard mostra métricas (enviados, lidos, respondidos) | Manual | `/dashboard` → `DashboardMetrics`. Alimentado por `trpc.dashboard.metrics`. |
| 8 | Campanha pausa automaticamente quando lead responde | Manual+Auto | Simular webhook Directfy com `status=replied`. Confirmar `agent_queue` ficar `cancelled` e `leads.status_pipeline=respondeu`. Notificação toast + badge via [src/components/layout/notification-bell.tsx](../src/components/layout/notification-bell.tsx). |
| 9 | Usuário exporta leads para CSV | Manual | `/leads → Exportar`. Endpoint: [src/app/api/leads/export/route.ts](../src/app/api/leads/export/route.ts). |
| 10 | Billing funciona (R$197/mês via Stripe) | Manual+Auto | `/settings/billing` → Checkout Stripe. Webhook coberto por testes unitários ([src/server/services/stripe-helpers.test.ts](../src/server/services/stripe-helpers.test.ts)). Necessário: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER=...`. |

---

## Trial (política 7 dias / 50 leads)

- [ ] Badge no header mostra "Xd · Y/50" enquanto `plan=trial` — [src/components/layout/trial-badge.tsx](../src/components/layout/trial-badge.tsx)
- [ ] `/generate` retorna erro `reason=trial_expired` após `trial_ends_at < now()`
- [ ] `/generate` retorna erro `reason=trial_quota` quando `leads_generated_count >= 50`
- [ ] Agent executor pula triggers não-manuais com trial expirado (executor.ts:78)
- [ ] Cobertura: 5 testes em [src/lib/trial/limits.test.ts](../src/lib/trial/limits.test.ts)

## Observabilidade + segurança

- [ ] Logger JSON estruturado substituindo `console.*` nos webhooks e workers
- [ ] `/api/webhooks/directfy` retorna 503 sem `DIRECTFY_WEBHOOK_SECRET` (fail-closed)
- [ ] `.env.example` completo para bootstrap de devs novos
- [ ] CI roda lint + typecheck + test em cada PR

---

## Próximos passos não cobertos neste bloco

- Integração Sentry real (logger é JSON pronto para ingest; falta DSN + SDK)
- Calendly dinâmico (atualmente só URL estática)
- Cron de expiração de trial (hoje verificamos em request-time — suficiente para MVP)
- Camada de serviços extraindo lógica dos routers (dívida técnica, pós-launch)
