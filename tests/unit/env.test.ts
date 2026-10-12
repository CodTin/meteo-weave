import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', '')
  vi.stubEnv('VITE_SENTRY_DSN', '')
  vi.stubEnv('VITE_ENABLE_TELEMETRY', '')
  vi.stubEnv('SENTRY_ENABLED', '')
  vi.stubEnv('SENTRY_DSN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('environment bootstrap', () => {
  it('starts without credentials and leaves telemetry disabled', async () => {
    const { clientEnv } = await import('@/lib/env/client')
    const { serverEnv } = await import('@/lib/env/server.server')
    expect(clientEnv.VITE_ENABLE_TELEMETRY).toBe(false)
    expect(clientEnv.VITE_MAPBOX_ACCESS_TOKEN).toBeUndefined()
    expect(serverEnv.SENTRY_ENABLED).toBe(false)
    expect(serverEnv.SENTRY_DSN).toBeUndefined()
  })

  it('does not interpret the string false as a truthy telemetry flag', async () => {
    vi.stubEnv('VITE_ENABLE_TELEMETRY', 'false')
    const { clientEnv } = await import('@/lib/env/client')
    expect(clientEnv.VITE_ENABLE_TELEMETRY).toBe(false)
  })

  it('accepts explicitly enabled telemetry', async () => {
    vi.stubEnv('VITE_ENABLE_TELEMETRY', 'true')
    const { clientEnv } = await import('@/lib/env/client')
    expect(clientEnv.VITE_ENABLE_TELEMETRY).toBe(true)
  })

  it('rejects secret Mapbox tokens in public configuration', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'sk.not-a-public-token')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(import('@/lib/env/client')).rejects.toThrow()
  })

  it('rejects malformed server configuration', async () => {
    vi.stubEnv('SENTRY_DSN', 'not-a-url')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(import('@/lib/env/server.server')).rejects.toThrow()
  })
})
