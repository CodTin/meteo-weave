import { describe, expect, it } from 'vitest'
import {
  alignWindGridData,
  computeSharedWindSpeedScale,
  computeWindSpeedDifferenceScale,
  type WindGridData,
} from '@/features/result-analysis/service/wind-comparison-data'

describe('Wind Comparison Data - Alignment and Scales', () => {
  describe('alignWindGridData', () => {
    it('aligns wind data by matching coordinates and computes vectors', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: 4.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)

      expect(aligned).toHaveLength(1)
      expect(aligned[0]!.original.speed).toBe(5.0)
      expect(aligned[0]!.downscaled.speed).toBe(10.0)
      expect(aligned[0]!.speedDifference).toBe(5.0)
    })

    it('handles missing wind components correctly', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: null },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)

      expect(aligned).toHaveLength(1)
      expect(aligned[0]!.original.speed).toBeNull()
      expect(aligned[0]!.original.directionStatus).toBe('unavailable')
      expect(aligned[0]!.downscaled.speed).toBe(10.0)
      expect(aligned[0]!.speedDifference).toBeNull()
    })

    it('distinguishes calm wind from missing components', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 0.0, v10: 0.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: 4.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)

      expect(aligned).toHaveLength(1)
      expect(aligned[0]!.original.speed).toBe(0.0)
      expect(aligned[0]!.original.directionStatus).toBe('calm')
      expect(aligned[0]!.original.fromDirection).toBeNull()
      expect(aligned[0]!.downscaled.speed).toBe(5.0)
      expect(aligned[0]!.downscaled.directionStatus).toBe('available')
    })

    it('computes wind direction for both datasets', () => {
      // Westerly wind in original (from west)
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 5.0, v10: 0.0 },
        ],
      }
      // Southerly wind in downscaled (from south)
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 0.0, v10: 5.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)

      expect(aligned).toHaveLength(1)
      expect(aligned[0]!.original.fromDirection).toBe(270) // West
      expect(aligned[0]!.downscaled.fromDirection).toBe(180) // South
    })

    it('handles mismatched grids', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: 4.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
          { longitude: 120.1, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 7.0, v10: 9.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)

      expect(aligned.length).toBeGreaterThanOrEqual(2)
      const matched = aligned.find((p) => p.longitude === 120.0 && p.latitude === 30.0)
      expect(matched).toBeDefined()
      expect(matched!.original.speed).toBe(5.0)
      expect(matched!.downscaled.speed).toBe(10.0)

      const unmatchedInOriginal = aligned.find((p) => p.longitude === 120.1)
      expect(unmatchedInOriginal).toBeDefined()
      expect(unmatchedInOriginal!.original.speed).toBeNull()
      expect(unmatchedInOriginal!.downscaled.speed).toBeCloseTo(11.4, 1)
    })
  })

  describe('computeSharedWindSpeedScale', () => {
    it('computes scale from 0 to maximum speed', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: 4.0 },
          { longitude: 120.1, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
          { longitude: 120.1, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 9.0, v10: 12.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)
      const scale = computeSharedWindSpeedScale(aligned)

      expect(scale.min).toBe(0)
      expect(scale.max).toBe(15.0)
    })

    it('includes calm winds at zero', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 0.0, v10: 0.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 3.0, v10: 4.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)
      const scale = computeSharedWindSpeedScale(aligned)

      expect(scale.min).toBe(0)
      expect(scale.max).toBe(5.0)
    })

    it('excludes null speeds from scale computation', () => {
      const original: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: null, v10: 4.0 },
        ],
      }
      const downscaled: WindGridData = {
        points: [
          { longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', u10: 6.0, v10: 8.0 },
        ],
      }

      const aligned = alignWindGridData(original, downscaled)
      const scale = computeSharedWindSpeedScale(aligned)

      expect(scale.min).toBe(0)
      expect(scale.max).toBe(10.0)
    })
  })

  describe('computeWindSpeedDifferenceScale', () => {
    it('computes symmetric diverging scale', () => {
      const differences = [-5.0, -2.0, 1.0, 3.0, 7.0]
      const scale = computeWindSpeedDifferenceScale(differences)

      expect(scale.min).toBe(-7.0)
      expect(scale.max).toBe(7.0)
    })

    it('handles all-zero differences', () => {
      const differences = [0, 0, 0]
      const scale = computeWindSpeedDifferenceScale(differences)

      expect(scale.min).toBe(-1)
      expect(scale.max).toBe(1)
    })

    it('excludes null differences', () => {
      const differences = [null, -3.0, null, 5.0, null]
      const scale = computeWindSpeedDifferenceScale(differences)

      expect(scale.min).toBe(-5.0)
      expect(scale.max).toBe(5.0)
    })

    it('handles empty or all-null input', () => {
      const differences: (number | null)[] = [null, null]
      const scale = computeWindSpeedDifferenceScale(differences)

      expect(scale.min).toBe(-1)
      expect(scale.max).toBe(1)
    })
  })
})
