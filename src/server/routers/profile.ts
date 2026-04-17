import { z } from 'zod'
import { router, protectedProcedure } from '@/lib/trpc'

/**
 * Slugify a company name for use as org slug. We keep this in sync with the
 * bootstrap helper so a user who types "Acme Ltda" during onboarding gets
 * `acme-ltda` as their org slug (and not the email-derived one).
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org'
}

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('*')
      .eq('id', ctx.user.id)
      .single()

    if (error) throw error
    return data
  }),

  update: protectedProcedure
    .input(
      z.object({
        full_name: z.string().min(1).optional(),
        company_name: z.string().optional(),
        phone: z.string().optional(),
        directfy_api_key: z.string().optional(),
        calendly_url: z.string().url().optional().or(z.literal('')),
        onboarding_completed: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('profiles')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', ctx.user.id)
        .select('*, current_organization_id')
        .single()

      if (error) throw error

      // When the user sets their company name during onboarding, rename their
      // current organization to match. Fase 0's bootstrap created orgs named
      // after the email, which is ugly in the UI — this is the fix-at-the-root.
      if (input.company_name && input.company_name.trim().length > 0) {
        const orgId = (data as { current_organization_id: string | null })
          .current_organization_id
        if (orgId) {
          const newName = input.company_name.trim()
          const baseSlug = slugify(newName)

          // Try the clean slug first; if taken, suffix with a short hash of
          // orgId so two "Acme" orgs don't collide.
          let slug = baseSlug
          const { data: conflict } = await ctx.supabase
            .from('organizations')
            .select('id')
            .eq('slug', slug)
            .neq('id', orgId)
            .maybeSingle()
          if (conflict) slug = `${baseSlug}-${orgId.slice(0, 6)}`

          await ctx.supabase
            .from('organizations')
            .update({
              name: newName,
              slug,
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId)
        }
      }

      return data
    }),
})
