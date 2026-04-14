import { router } from '@/lib/trpc'
import { leadsRouter } from './leads'
import { campaignsRouter } from './campaigns'
import { profileRouter } from './profile'
import { dashboardRouter } from './dashboard'
import { stripeRouter } from './stripe'

export const appRouter = router({
  leads: leadsRouter,
  campaigns: campaignsRouter,
  profile: profileRouter,
  dashboard: dashboardRouter,
  stripe: stripeRouter,
})

export type AppRouter = typeof appRouter
