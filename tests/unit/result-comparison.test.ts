import { describe, expect, it } from 'vitest'
import {
  computeDifference,
  alignGridData,
  type GridData,
} from '@/features/result-analysis/service/comparison-data'

describe('Result Comparison - Data Alignment and Difference', () => {
  describe('computeDifference', () => {
    it('computes downscaled minus original for valid values', () => {
      const original = 20.0
      const downscaled = 22.5
      const diff = computeDifference(downscaled, original)

      expect(diff).toBe(2.5)
    })

    it('returns positive when downscaled is higher', () => {
      const diff = computeDifference(25.0, 20.0)
      expect(diff).toBeGreaterThan(0)
    })

    it('returns negative when downscaled is lower', () => {
      const diff = computeDifference(18.0, 22.0)
      expect(diff).toBeLessThan(0)
    })

    it('returns zero when values are equal', () => {
      const diff = computeDifference(20.0, 20.0)
      expect(diff).toBe(0)
    })

    it('returns null when original is missing', () => {
      const diff = computeDifference(22.5, null)
      expect(diff).toBeNull()
    })

    it('returns null when downscaled is missing', () => {
      const diff = computeDifference(null, 20.0)
      expect(diff).toBeNull()
    })

    it('returns null when both are missing', () => {
      const diff = computeDifference(null, null)
      expect(diff).toBeNull()
    })

    it('returns null for NaN values', () => {
      expect(computeDifference(NaN, 20.0)).toBeNull()
      expect(computeDifference(20.0, NaN)).toBeNull()
      expect(computeDifference(NaN, NaN)).toBeNull()
    })

    it('returns null for infinite values', () => {
      expect(computeDifference(Infinity, 20.0)).toBeNull()
      expect(computeDifference(20.0, -Infinity)).toBeNull()
    })
  })

  describe('alignGridData', () => {
    it('aligns data by matching longitude, latitude, and time', () => {
      const original: GridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 20.0 },
          { longitude: 120.5, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 21.0 },
        ],
      }
      const downscaled: GridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 },
          { longitude: 120.5, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 23.5 },
        ],
      }

      const aligned = alignGridData(original, downscaled)

      expect(aligned).toHaveLength(2)
      expect(aligned[0]).toEqual({
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        original: 20.0,
        downscaled: 22.0,
      })
      expect(aligned[1]).toEqual({
        longitude: 120.5,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        original: 21.0,
        downscaled: 23.5,
      })
    })

    it('handles missing data points gracefully', () => {
      const original: GridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 20.0 },
          { longitude: 120.5, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 21.0 },
        ],
      }
      const downscaled: GridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 },
          // Missing the second point
        ],
      }

      const aligned = alignGridData(original, downscaled)

      expect(aligned).toHaveLength(2)
      expect(aligned[0]!.original).toBe(20.0)
      expect(aligned[0]!.downscaled).toBe(22.0)
      expect(aligned[1]!.original).toBe(21.0)
      expect(aligned[1]!.downscaled).toBeNull()
    })

    it('preserves null values from source data', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: null }],
      }
      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 }],
      }

      const aligned = alignGridData(original, downscaled)

      expect(aligned[0]!.original).toBeNull()
      expect(aligned[0]!.downscaled).toBe(22.0)
    })

    it('handles different grid resolutions by matching coordinates', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 20.0 }],
      }
      const downscaled: GridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 },
          { longitude: 120.1, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.5 },
          { longitude: 120.0, latitude: 30.1, time: '2024-01-01T00:00:00Z', value: 23.0 },
        ],
      }

      const aligned = alignGridData(original, downscaled)

      // Should only align the matching coordinate
      expect(aligned.length).toBeGreaterThanOrEqual(1)
      const matched = aligned.find((p) => p.longitude === 120.0 && p.latitude === 30.0)
      expect(matched).toBeDefined()
      expect(matched!.original).toBe(20.0)
      expect(matched!.downscaled).toBe(22.0)
    })
  })

  describe('Color scale computation', () => {
    it('computes shared absolute scale from finite values only', () => {
      const values = [20.0, 22.5, null, 18.0, NaN, 25.0]
      const finiteValues = values.filter((v) => v !== null && Number.isFinite(v)) as number[]

      const min = Math.min(...finiteValues)
      const max = Math.max(...finiteValues)

      expect(min).toBe(18.0)
      expect(max).toBe(25.0)
    })

    it('computes symmetric diverging scale centered at zero', () => {
      const differences = [-2.5, 1.0, -1.5, 3.0, null]
      const finiteDiffs = differences.filter((v) => v !== null && Number.isFinite(v)) as number[]

      const absMax = Math.max(...finiteDiffs.map(Math.abs))
      const min = -absMax
      const max = absMax

      expect(min).toBe(-3.0)
      expect(max).toBe(3.0)
    })

    it('handles all-zero differences', () => {
      const differences = [0, 0, 0]
      const absMax = Math.max(...differences.map(Math.abs))

      expect(absMax).toBe(0)
    })
  })
})
