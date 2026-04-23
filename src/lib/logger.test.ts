import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.resetModules()
  })

  afterEach(() => {
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('emits structured JSON with level and msg', async () => {
    process.env.LOG_LEVEL = 'debug'
    const { logger } = await import('./logger')
    logger.info('hello', { foo: 'bar' })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const [line] = logSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({ level: 'info', msg: 'hello', foo: 'bar', app: 'ativafy' })
    expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('filters below min level', async () => {
    process.env.LOG_LEVEL = 'warn'
    const { logger } = await import('./logger')
    logger.debug('skip')
    logger.info('skip')
    logger.warn('kept')
    logger.error('kept')
    expect(logSpy).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledTimes(2)
  })

  it('routes warn/error to console.error, info/debug to console.log', async () => {
    process.env.LOG_LEVEL = 'debug'
    const { logger } = await import('./logger')
    logger.debug('a')
    logger.info('b')
    logger.warn('c')
    logger.error('d')
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(errSpy).toHaveBeenCalledTimes(2)
  })

  it('child logger merges bindings', async () => {
    process.env.LOG_LEVEL = 'debug'
    const { childLogger } = await import('./logger')
    const log = childLogger('webhook:test', { requestId: 'r1' })
    log.info('x', { extra: 42 })
    const [line] = logSpy.mock.calls[0] as [string]
    const parsed = JSON.parse(line)
    expect(parsed).toMatchObject({
      scope: 'webhook:test',
      requestId: 'r1',
      extra: 42,
      msg: 'x',
    })
  })
})
