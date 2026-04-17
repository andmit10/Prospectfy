import { router, orgProcedure } from '@/lib/trpc'
import { getTrialStatus } from '@/lib/trial/limits'

export const trialRouter = router({
  /**
   * Returns the caller's org trial status (days left, leads used, blocked).
   * Used by the header badge and the upgrade modal. Cheap query — a single
   * organizations row read.
   */
  getStatus: orgProcedure.query(async ({ ctx }) => {
    return getTrialStatus(ctx.supabase, ctx.orgId)
  }),
})
