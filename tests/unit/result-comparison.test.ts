import { describe, expect, it } from 'vitest'
import {
  computeDifference,
  alignGridData,
  intervalsMatch,
  type GridData,
  type AccumulationInterval,
} from '@/features/result-analysis/service/comparison-data'
import {
  getAbsoluteColorScale,
  getDifferenceColorScale,
  getVariableUnit,
  getVariableLabel,
  type Variable,
} from '@/features/result-analysis/service/color-scales'

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

      const result = alignGridData(original, downscaled)

      expect(result.points).toHaveLength(2)
      expect(result.intervalsMatch).toBe(true)
      expect(result.points[0]).toEqual({
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        original: 20.0,
        downscaled: 22.0,
      })
      expect(result.points[1]).toEqual({
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

      const result = alignGridData(original, downscaled)

      expect(result.points).toHaveLength(2)
      expect(result.points[0]!.original).toBe(20.0)
      expect(result.points[0]!.downscaled).toBe(22.0)
      expect(result.points[1]!.original).toBe(21.0)
      expect(result.points[1]!.downscaled).toBeNull()
    })

    it('preserves null values from source data', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: null }],
      }
      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 }],
      }

      const result = alignGridData(original, downscaled)

      expect(result.points[0]!.original).toBeNull()
      expect(result.points[0]!.downscaled).toBe(22.0)
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

      const result = alignGridData(original, downscaled)

      // Should only align the matching coordinate
      expect(result.points.length).toBeGreaterThanOrEqual(1)
      const matched = result.points.find((p) => p.longitude === 120.0 && p.latitude === 30.0)
      expect(matched).toBeDefined()
      expect(matched!.original).toBe(20.0)
      expect(matched!.downscaled).toBe(22.0)
    })

    it('detects matching accumulation intervals', () => {
      const interval: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }

      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T06:00:00Z', value: 10.5 }],
        accumulationInterval: interval,
      }

      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T06:00:00Z', value: 12.0 }],
        accumulationInterval: interval,
      }

      const result = alignGridData(original, downscaled)

      expect(result.intervalsMatch).toBe(true)
      expect(result.originalInterval).toEqual(interval)
      expect(result.downscaledInterval).toEqual(interval)
    })

    it('detects mismatched accumulation intervals', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T06:00:00Z', value: 10.5 }],
        accumulationInterval: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T06:00:00Z',
        },
      }

      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T12:00:00Z', value: 12.0 }],
        accumulationInterval: {
          start: '2024-01-01T06:00:00Z',
          end: '2024-01-01T12:00:00Z',
        },
      }

      const result = alignGridData(original, downscaled)

      expect(result.intervalsMatch).toBe(false)
    })

    it('treats undefined intervals as matching (instantaneous values)', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 20.0 }],
      }

      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T00:00:00Z', value: 22.0 }],
      }

      const result = alignGridData(original, downscaled)

      expect(result.intervalsMatch).toBe(true)
      expect(result.originalInterval).toBeUndefined()
      expect(result.downscaledInterval).toBeUndefined()
    })

    it('detects mismatch when one has interval and other does not', () => {
      const original: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T06:00:00Z', value: 10.5 }],
        accumulationInterval: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T06:00:00Z',
        },
      }

      const downscaled: GridData = {
        points: [{ longitude: 120.0, latitude: 30.0, time: '2024-01-01T06:00:00Z', value: 22.0 }],
      }

      const result = alignGridData(original, downscaled)

      expect(result.intervalsMatch).toBe(false)
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

  describe('intervalsMatch', () => {
    it('returns true when both intervals are undefined', () => {
      expect(intervalsMatch(undefined, undefined)).toBe(true)
    })

    it('returns false when only one interval is defined', () => {
      const interval: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }

      expect(intervalsMatch(interval, undefined)).toBe(false)
      expect(intervalsMatch(undefined, interval)).toBe(false)
    })

    it('returns true when intervals have identical start and end times', () => {
      const interval1: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }
      const interval2: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }

      expect(intervalsMatch(interval1, interval2)).toBe(true)
    })

    it('returns false when intervals have different start times', () => {
      const interval1: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }
      const interval2: AccumulationInterval = {
        start: '2024-01-01T01:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }

      expect(intervalsMatch(interval1, interval2)).toBe(false)
    })

    it('returns false when intervals have different end times', () => {
      const interval1: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
      }
      const interval2: AccumulationInterval = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T12:00:00Z',
      }

      expect(intervalsMatch(interval1, interval2)).toBe(false)
    })
  })

  describe('Color scale configuration', () => {
    it('provides correct units for each variable', () => {
      expect(getVariableUnit('temperature')).toBe('°C')
      expect(getVariableUnit('pressure')).toBe('hPa')
      expect(getVariableUnit('precipitation')).toBe('mm')
      expect(getVariableUnit('wind')).toBe('m/s')
    })

    it('provides correct labels for each variable', () => {
      expect(getVariableLabel('temperature')).toBe('Temperature')
      expect(getVariableLabel('pressure')).toBe('Pressure (MSL)')
      expect(getVariableLabel('precipitation')).toBe('Precipitation (TP)')
      expect(getVariableLabel('wind')).toBe('Wind Speed')
    })

    it('provides pressure color scale with purple to white to orange', () => {
      const scale = getAbsoluteColorScale('pressure')

      expect(scale.type).toBe('sequential')
      expect(scale.colors).toContain('#9333ea') // Purple
      expect(scale.colors).toContain('#ffffff') // White
      expect(scale.colors).toContain('#ea580c') // Orange
      expect(scale.description).toContain('Purple')
      expect(scale.description).toContain('Orange')
    })

    it('provides precipitation color scale with white to blue to deep blue', () => {
      const scale = getAbsoluteColorScale('precipitation')

      expect(scale.type).toBe('sequential')
      expect(scale.colors).toContain('#ffffff') // White
      expect(scale.colors).toContain('#0ea5e9') // Blue
      expect(scale.colors).toContain('#0c4a6e') // Deep blue
      expect(scale.description).toContain('White')
      expect(scale.description).toContain('Blue')
    })

    it('provides temperature color scale with blue to white to red', () => {
      const scale = getAbsoluteColorScale('temperature')

      expect(scale.type).toBe('diverging')
      expect(scale.colors).toContain('#2563eb') // Blue
      expect(scale.colors).toContain('#ffffff') // White
      expect(scale.colors).toContain('#dc2626') // Red
    })

    it('provides symmetric diverging scale for differences', () => {
      const scale = getDifferenceColorScale()

      expect(scale.type).toBe('diverging')
      expect(scale.description).toContain('negative')
      expect(scale.description).toContain('positive')
    })
  })

  describe('Variable-specific behavior', () => {
    const variables: Variable[] = ['temperature', 'pressure', 'precipitation', 'wind']

    it('all variables have color scales defined', () => {
      variables.forEach((variable) => {
        const scale = getAbsoluteColorScale(variable)
        expect(scale).toBeDefined()
        expect(scale.colors.length).toBeGreaterThan(0)
        expect(scale.description).toBeTruthy()
      })
    })

    it('all variables have units defined', () => {
      variables.forEach((variable) => {
        const unit = getVariableUnit(variable)
        expect(unit).toBeTruthy()
        expect(typeof unit).toBe('string')
      })
    })

    it('all variables have labels defined', () => {
      variables.forEach((variable) => {
        const label = getVariableLabel(variable)
        expect(label).toBeTruthy()
        expect(typeof label).toBe('string')
      })
    })
  })
})
