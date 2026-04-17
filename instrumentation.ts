import * as Sentry from '@sentry/nextjs'

/**
 * Next.js calls this once per runtime to initialise server/edge observability.
 * Kept minimal: we load the correct Sentry config for each runtime and
 * short-circuit when the DSN is unset so local dev has zero surprises.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
