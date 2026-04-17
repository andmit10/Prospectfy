type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
const minWeight = LEVEL_WEIGHT[minLevel] ?? 20

type Fields = Record<string, unknown>

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

export const logger = make({ app: 'prospectfy' })

export function childLogger(scope: string, fields?: Fields): Logger {
  return logger.child({ scope, ...(fields ?? {}) })
}
