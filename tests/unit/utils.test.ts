import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('shadcn class-name utility', () => {
  it('merges conditional values and resolves Tailwind conflicts', () => {
    expect(cn('p-2 text-sm', false, { hidden: false }, 'p-4')).toBe('text-sm p-4')
  })
})
