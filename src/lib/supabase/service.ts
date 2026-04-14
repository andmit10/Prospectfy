import { createClient } from '@supabase/supabase-js'
import { clientEnv } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'

// Service-role client — bypasses RLS. Only use in trusted server contexts (workers, crons).
export function createServiceClient() {
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}
