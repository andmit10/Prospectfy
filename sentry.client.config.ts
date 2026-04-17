import * as Sentry from '@sentry/nextjs'

// Client-side Sentry init. No-op when DSN is absent so local dev stays clean.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Trace a small slice in prod; everything in dev so you can verify once.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Keep replays off until we opt in — they're heavy and need UI review.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
