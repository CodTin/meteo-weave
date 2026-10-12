import { describe, expect, it } from 'vitest'
import { createQueryClient } from '@/lib/query/client'

describe('query client bootstrap', () => {
  it('isolates caches between SSR requests', () => {
    const first = createQueryClient()
    const second = createQueryClient()
    first.setQueryData(['bootstrap'], 'private')
    expect(second).not.toBe(first)
    expect(second.getQueryData(['bootstrap'])).toBeUndefined()
    first.clear()
    second.clear()
  })

  it('uses a nonzero stale time to avoid immediate hydration refetches', () => {
    const client = createQueryClient()
    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000)
    client.clear()
  })
})
