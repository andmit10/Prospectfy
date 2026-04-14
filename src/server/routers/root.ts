import { router } from '@/lib/trpc'
import { leadsRouter } from './leads'
import { campaignsRouter } from './campaigns'
import { profileRouter } from './profile'
import { dashboardRouter } from './dashboard'
import { stripeRouter } from './stripe'
import { agentRouter } from './agent'

export const appRouter = router({
  leads: leadsRouter,
  campaigns: campaignsRouter,
  profile: profileRouter,
  dashboard: dashboardRouter,
  stripe: stripeRouter,
  agent: agentRouter,
})

export type AppRouter = typeof appRouter
