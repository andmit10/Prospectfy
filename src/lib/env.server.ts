import { z } from 'zod'

// Server-only env — never import this file from 'use client' components.
// Non-NEXT_PUBLIC_ vars are undefined in the browser bundle.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  DIRECTFY_API_URL: z.string().url().default('https://api.directfy.com'),
  DIRECTFY_WEBHOOK_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  // Shared Evolution Go server used to auto-provision WhatsApp instances for
  // any plan != enterprise. Enterprise orgs run on their own VPS and use the
  // per-integration `baseUrl` instead.
  EVOLUTION_GO_SHARED_BASE_URL: z.string().url().optional(),
  EVOLUTION_GO_SHARED_GLOBAL_API_KEY: z.string().min(1).optional(),
  EVOLUTION_GO_SHARED_IGNORE_TLS: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
  // Public app URL — used to build the webhook URL we register with Evolution Go.
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

function e(key: string) {
  const v = process.env[key]
  return v === '' ? undefined : v
}

export const serverEnv = serverSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: e('SUPABASE_SERVICE_ROLE_KEY'),
  ANTHROPIC_API_KEY: e('ANTHROPIC_API_KEY'),
  STRIPE_SECRET_KEY: e('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: e('STRIPE_WEBHOOK_SECRET'),
  DIRECTFY_API_URL: e('DIRECTFY_API_URL'),
  DIRECTFY_WEBHOOK_SECRET: e('DIRECTFY_WEBHOOK_SECRET'),
  REDIS_URL: e('REDIS_URL'),
  EVOLUTION_GO_SHARED_BASE_URL: e('EVOLUTION_GO_SHARED_BASE_URL'),
  EVOLUTION_GO_SHARED_GLOBAL_API_KEY: e('EVOLUTION_GO_SHARED_GLOBAL_API_KEY'),
  EVOLUTION_GO_SHARED_IGNORE_TLS: e('EVOLUTION_GO_SHARED_IGNORE_TLS'),
  NEXT_PUBLIC_APP_URL: e('NEXT_PUBLIC_APP_URL'),
  NODE_ENV: process.env.NODE_ENV,
})
