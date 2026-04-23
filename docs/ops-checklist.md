# Ops Checklist — Deploy & Configuração

Passos que dependem de painéis externos (Vercel, Supabase, Stripe, Directfy,
Sentry). Cada item indica o estado atual e o que você precisa fazer uma única
vez para colocar o Ativafy em produção.

## 1. Variáveis de ambiente (Vercel)

Rodar a partir de um shell autenticado no Vercel CLI (`npx vercel login` e
`npx vercel link` se ainda não estiver linkado):

```bash
# Supabase — já configurados, só confirmar
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production

# Directfy — CRÍTICO (webhook retorna 503 sem o secret)
npx vercel env add DIRECTFY_API_URL production       # https://api.directfy.com
npx vercel env add DIRECTFY_WEBHOOK_SECRET production
# Secret gerado nesta sessão (cole exatamente este valor tanto no Vercel quanto
# no painel da Directfy em "Webhooks → assinatura HMAC-SHA256"):
#   60690b43628b53cbdea66db82f0407f7f62ef1b5c55ed8c124eb6494391bcbd9

# Stripe — para billing funcionar
npx vercel env add STRIPE_SECRET_KEY production
npx vercel env add STRIPE_WEBHOOK_SECRET production
npx vercel env add STRIPE_PRICE_STARTER production   # price_...
npx vercel env add STRIPE_PRICE_PRO production       # price_...

# Anthropic
npx vercel env add ANTHROPIC_API_KEY production

# Redis (hospedado na sua VPS Hostinger ou Upstash free tier)
npx vercel env add REDIS_URL production
# Formato: redis://default:PASSWORD@host:6379 (habilite TLS se Upstash)

# Cron (secret que o vercel.json usa como x-cron-secret)
npx vercel env add CRON_SECRET production
# Secret gerado nesta sessão:
#   d3d8d65def30d1b4d73b99cebb6c42c15037e0a9c9864fa1fdff77a9b0c6b3f8

# Sentry (opcional — ativa captura automática)
npx vercel env add NEXT_PUBLIC_SENTRY_DSN production
# Crie em sentry.io → Create Project → Next.js → copie o DSN
```

Pelo menos `DIRECTFY_WEBHOOK_SECRET`, `CRON_SECRET`, `REDIS_URL` e os
`STRIPE_*` devem ser novos. Depois de cada `env add` rode `npx vercel --prod`
uma vez para propagar.

## 2. Migrations Supabase

O Supabase CLI ainda não está instalado nesta máquina. Dois caminhos:

### Caminho A — instalar o CLI (recomendado para evoluir o schema)

```bash
# Windows (npm global)
npm install --global supabase

# Depois, autenticar e linkar ao seu projeto
supabase login
supabase link --project-ref <seu-project-ref>
# O project-ref aparece na URL do dashboard: https://supabase.com/dashboard/project/<ref>

npm run db:migrate
```

### Caminho B — rodar o SQL direto no painel (mais rápido se for só agora)

Abra o SQL Editor do projeto no Supabase e cole o conteúdo destes dois
arquivos, em ordem:

1. [supabase/migrations/20260417000011_trial_limits.sql](../supabase/migrations/20260417000011_trial_limits.sql)
   — colunas de trial + RPC de incremento
2. [supabase/migrations/20260417000012_realtime.sql](../supabase/migrations/20260417000012_realtime.sql)
   — habilita Realtime nas tabelas `interactions` e `leads`

Execute cada um e confirme `Success. No rows returned`.

## 3. Webhooks

- **Directfy** → painel → Webhooks → endpoint: `https://seu-dominio.vercel.app/api/webhooks/directfy`; secret: o mesmo `DIRECTFY_WEBHOOK_SECRET` do passo 1.
- **Stripe** → dashboard → Developers → Webhooks → endpoint: `https://seu-dominio.vercel.app/api/webhooks/stripe`; eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copie o signing secret para `STRIPE_WEBHOOK_SECRET`.

## 4. Redis (opcional mas recomendado)

O rate limit e o BullMQ dos workers precisam de Redis. Opções:

- **Upstash free tier**: `upstash.com` → Create Database → Global → copiar a `REDIS_URL`.
- **Hostinger VPS**: SSH na VPS, `sudo apt install redis`, editar `/etc/redis/redis.conf` para `bind 0.0.0.0`, setar `requirepass`, abrir firewall na 6379, `systemctl restart redis-server`. `REDIS_URL=redis://default:<senha>@<ip-vps>:6379`.

## 5. Smoke test

Ver [docs/smoke-test.md](smoke-test.md). Pode rodar depois que env vars +
migrations + webhooks estiverem prontos.
