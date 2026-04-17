// Populate env vars required by server-side schemas (src/lib/env.server.ts,
// src/lib/env.ts) before any module imports them. Vitest loads this file via
// `setupFiles` in vitest.config.ts.

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.DIRECTFY_API_URL ??= 'https://api.directfy.test'
// NODE_ENV is typed read-only by @types/node — set via indexer.
;(process.env as Record<string, string | undefined>).NODE_ENV ??= 'test'
