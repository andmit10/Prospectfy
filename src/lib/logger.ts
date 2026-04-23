type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
const minWeight = LEVEL_WEIGHT[minLevel] ?? 20

type Fields = Record<string, unknown>

// Sentry is loaded lazily and only when a DSN is configured. Keeping it off
// the module's top-level imports avoids pulling the Sentry browser SDK into
// worker/test bundles where it's unused.
type SentryLike = {
  captureException: (err: unknown, ctx?: { extra?: Fields }) => void
  captureMessage: (msg: string, ctx?: { level?: 'warning' | 'error'; extra?: Fields }) => void
}
let sentry: SentryLike | null | undefined

async function getSentry(): Promise<SentryLike | null> {
  if (sentry !== undefined) return sentry
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    sentry = null
    return null
  }
  try {
    const mod = await import('@sentry/nextjs')
    sentry = mod as unknown as SentryLike
  } catch {
    sentry = null
  }
  return sentry
}

function emit(level: Level, msg: string, fields?: Fields) {
  if (LEVEL_WEIGHT[level] < minWeight) return
  const payload = {
    level,
    msg,
    time: new Date().toISOString(),
    ...fields,
  }
  const line = JSON.stringify(payload)
  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }

  // Forward errors (and warnings) to Sentry when available. Fire-and-forget —
  // never await, never throw back into the caller.
  if (level === 'error' || level === 'warn') {
    void getSentry().then((s) => {
      if (!s) return
      const err = fields?.error
      if (err instanceof Error) {
        s.captureException(err, { extra: fields })
      } else if (level === 'error') {
        s.captureMessage(msg, { level: 'error', extra: fields })
      } else {
        s.captureMessage(msg, { level: 'warning', extra: fields })
      }
    })
  }
}

export type Logger = {
  debug: (msg: string, fields?: Fields) => void
  info: (msg: string, fields?: Fields) => void
  warn: (msg: string, fields?: Fields) => void
  error: (msg: string, fields?: Fields) => void
  child: (bindings: Fields) => Logger
}

function make(bindings: Fields): Logger {
  const bind = (f?: Fields) => ({ ...bindings, ...(f ?? {}) })
  return {
    debug: (m, f) => emit('debug', m, bind(f)),
    info: (m, f) => emit('info', m, bind(f)),
    warn: (m, f) => emit('warn', m, bind(f)),
    error: (m, f) => emit('error', m, bind(f)),
    child: (b) => make({ ...bindings, ...b }),
  }
}

export const logger = make({ app: 'ativafy' })

export function childLogger(scope: string, fields?: Fields): Logger {
  return logger.child({ scope, ...(fields ?? {}) })
}
