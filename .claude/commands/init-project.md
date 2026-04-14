Initialize the Orbya SaaS project from scratch.

Follow these steps in order:

## Step 1: Create Next.js project
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

## Step 2: Install dependencies
```bash
# UI
npx shadcn@latest init
npx shadcn@latest add button card input label table badge dialog sheet tabs separator avatar dropdown-menu

# tRPC
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod superjson

# Supabase
npm install @supabase/supabase-js @supabase/ssr

# Utils
npm install lucide-react date-fns papaparse xlsx

# Dev
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

## Step 3: Setup environment
Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
DIRECTFY_API_KEY=
DIRECTFY_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
CALENDLY_API_KEY=
```

## Step 4: Create project structure
```
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx (sidebar + header)
│   │   ├── dashboard/page.tsx
│   │   ├── leads/page.tsx
│   │   ├── leads/[id]/page.tsx
│   │   ├── campaigns/page.tsx
│   │   ├── campaigns/[id]/page.tsx
│   │   ├── campaigns/new/page.tsx
│   │   └── settings/page.tsx
│   ├── api/trpc/[trpc]/route.ts
│   ├── api/webhooks/directfy/route.ts
│   ├── api/webhooks/stripe/route.ts
│   └── layout.tsx
├── components/
│   ├── layout/sidebar.tsx
│   ├── layout/header.tsx
│   ├── leads/lead-table.tsx
│   ├── leads/import-dialog.tsx
│   ├── campaigns/campaign-wizard.tsx
│   └── dashboard/metric-cards.tsx
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── supabase/middleware.ts
│   ├── trpc/client.ts
│   ├── trpc/server.ts
│   ├── env.ts (Zod validated env vars)
│   └── utils.ts
├── server/
│   ├── routers/
│   │   ├── _app.ts (root router)
│   │   ├── leads.ts
│   │   ├── campaigns.ts
│   │   └── interactions.ts
│   └── services/
│       ├── directfy.ts
│       ├── agent.ts
│       └── scoring.ts
├── agents/
│   ├── tools/
│   │   ├── send-whatsapp.ts
│   │   ├── update-score.ts
│   │   ├── move-pipeline.ts
│   │   └── schedule-meeting.ts
│   ├── prompts/
│   │   └── sdr-agent.ts
│   └── orchestrator.ts
└── types/
    ├── lead.ts
    ├── campaign.ts
    └── interaction.ts
```

## Step 5: Create base files
Create each file with minimal working content. Start with:
1. `src/lib/env.ts` — Zod schema for all env vars
2. `src/lib/supabase/client.ts` + `server.ts` — Supabase clients
3. `src/lib/trpc/` — tRPC setup
4. `src/server/routers/_app.ts` — root tRPC router
5. `src/app/(dashboard)/layout.tsx` — dashboard layout with sidebar

## Step 6: Verify
```bash
npm run dev
npm run typecheck
npm run lint
```

After completion, update docs/tasks/todo.md marking init tasks as complete.
