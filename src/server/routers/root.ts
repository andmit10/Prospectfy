import { router } from '@/lib/trpc'
import { leadsRouter } from './leads'
import { campaignsRouter } from './campaigns'
import { profileRouter } from './profile'

export const appRouter = router({
  leads: leadsRouter,
  campaigns: campaignsRouter,
  profile: profileRouter,
})

export type AppRouter = typeof appRouter
