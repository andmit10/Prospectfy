# Orbya SaaS — Plataforma de Prospecção Inteligente

## What
SaaS modular de prospecção B2B WhatsApp-first para PMEs brasileiras.
4 módulos: Geração de Leads, CRM Pipeline, Agentes de Prospecção (IA), Canais de Disparo.
Diferencial: WhatsApp nativo via Directfy (produto próprio), não depende de terceiros.

## Tech Stack
- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes + tRPC (type-safe)
- **Database**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Queue**: Redis + BullMQ (async jobs)
- **AI**: Claude API (claude-sonnet-4-20250514) com tool_use
- **Workflow**: n8n (orquestração de automações)
- **Deploy**: Vercel (frontend), Railway (workers)
- **Payments**: Stripe

## Project Structure
```
orbya-saas/
├── src/
│   ├── app/             # Next.js App Router pages
│   ├── components/      # React components (shadcn/ui based)
│   ├── lib/             # Shared utilities, Supabase client, tRPC
│   ├── server/          # tRPC routers, API logic
│   │   ├── routers/     # leads, campaigns, agents, channels
│   │   └── services/    # business logic per module
│   ├── agents/          # AI agent definitions + tool schemas
│   └── types/           # TypeScript types + Zod schemas
├── supabase/
│   ├── migrations/      # SQL migrations
│   └── seed.sql         # Seed data
├── workers/             # Background jobs (BullMQ consumers)
├── docs/                # PRD, architecture, API specs
└── .claude/             # Claude Code config
```

## Commands
```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint + Prettier check
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
npm run db:migrate   # Run Supabase migrations
npm run db:seed      # Seed database
npm run db:reset     # Reset + re-seed
npm run worker       # Start BullMQ worker
```

## Code Style
- Use ES modules (import/export), never CommonJS
- Destructure imports: `import { useState } from 'react'`
- Use `type` for TypeScript types, `interface` only for extension
- Zod for all runtime validation (API inputs, env vars, external data)
- Prefer server components; use `'use client'` only when needed
- Name files kebab-case: `lead-card.tsx`, `campaign-service.ts`
- Components PascalCase: `LeadCard`, `CampaignList`
- All user-facing text in Portuguese (pt-BR)
- Comments and code in English

## Architecture Rules
- Each module (leads, crm, agents, channels) has its own tRPC router
- Business logic lives in `server/services/`, NOT in API routes or components
- Supabase Row Level Security (RLS) on ALL tables — never bypass
- All external API calls go through service layer with error handling + retry
- Agent tool_use schemas defined in `agents/tools/` with Zod validation
- Background jobs (email send, WhatsApp dispatch, scraping) go through BullMQ
- Never store API keys in code — use environment variables via `src/lib/env.ts`

## Database Conventions
- Table names: snake_case plural (`leads`, `campaigns`, `interactions`)
- Column names: snake_case (`created_at`, `lead_score`)
- Always include: `id` (uuid), `created_at`, `updated_at`, `user_id`
- Soft delete: `deleted_at` timestamp, never hard delete user data
- Use Supabase RLS policies, not application-level auth checks

## Testing
- Vitest for unit + integration tests
- Test files: `*.test.ts` next to the file they test
- Minimum: test all tRPC routers + service functions
- Mock external APIs (Directfy, SendGrid, Claude) in tests

## Git Workflow
- Branch per feature: `feat/lead-import`, `fix/score-calc`
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Never commit to `main` directly
- Always run `npm run typecheck && npm run lint` before committing

## Current Phase
**Fase 1 — MVP (Semanas 1-8)**
Focus: Agent + Directfy + basic dashboard
Read @docs/prd.md for full requirements
Read @docs/database-schema.md for table definitions

## Task Management
1. Read the task from docs/tasks/todo.md
2. Plan approach, write it in the task file
3. Implement with tests
4. Run typecheck + lint + test
5. Commit with conventional commit message
6. Update todo.md marking task complete

## Lessons Learned
<!-- Claude: when you make a mistake and get corrected, add a rule here -->
