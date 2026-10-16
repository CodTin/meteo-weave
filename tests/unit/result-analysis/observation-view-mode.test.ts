import { describe, expect, it } from 'vitest'
import {
  normalizeObservationViewMode,
  toggleObservationViewMode,
} from '@/features/result-analysis/types/observation-view-mode'

describe('Observation View Mode', () => {
  describe('mode validation', () => {
    it('accepts "station" as valid mode', () => {
      const mode = normalizeObservationViewMode('station')
      expect(mode).toBe('station')
    })

    it('accepts "interpolated" as valid mode', () => {
      const mode = normalizeObservationViewMode('interpolated')
      expect(mode).toBe('interpolated')
    })

    it('defaults to "interpolated" for unknown modes', () => {
      const mode = normalizeObservationViewMode('invalid')
      expect(mode).toBe('interpolated')
    })

    it('defaults to "interpolated" for undefined', () => {
      const mode = normalizeObservationViewMode(undefined)
      expect(mode).toBe('interpolated')
    })
  })

  describe('mode toggle behavior', () => {
    it('toggles from interpolated to station', () => {
      const nextMode = toggleObservationViewMode('interpolated')
      expect(nextMode).toBe('station')
    })

    it('toggles from station to interpolated', () => {
      const nextMode = toggleObservationViewMode('station')
      expect(nextMode).toBe('interpolated')
    })
  })
})
