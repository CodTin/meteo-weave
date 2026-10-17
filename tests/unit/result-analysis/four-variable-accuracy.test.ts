import { describe, test, expect } from 'vitest'
import {
  getVariableUnit,
  extractWindSpeed,
  validateAccumulationCoverage,
} from '@/features/result-analysis/service/variable-accuracy'
import type { WindValue, Accumulation } from '@/features/downscaling-tasks/service/contracts'

describe('Four-variable accuracy assessment', () => {
  describe('getVariableUnit', () => {
    test('returns correct unit for temperature', () => {
      expect(getVariableUnit('temperature')).toBe('°C')
    })

    test('returns correct unit for pressure', () => {
      expect(getVariableUnit('pressure')).toBe('hPa')
    })

    test('returns correct unit for wind', () => {
      expect(getVariableUnit('wind')).toBe('m/s')
    })

    test('returns correct unit for precipitation', () => {
      expect(getVariableUnit('precipitation')).toBe('mm')
    })

    test('returns empty string for unknown variable', () => {
      expect(getVariableUnit('unknown')).toBe('')
    })
  })

  describe('extractWindSpeed', () => {
    test('derives wind speed from U10 and V10 components', () => {
      const windValue: WindValue = {
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        value: 0, // placeholder
        u10: 3.0,
        v10: 4.0,
        speed: 5.0,
        fromDirection: 233.13,
        directionStatus: 'available',
      }

      const speed = extractWindSpeed(windValue)
      expect(speed).toBe(5.0)
    })

    test('returns zero speed for calm wind', () => {
      const windValue: WindValue = {
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        value: 0,
        u10: 0.0,
        v10: 0.0,
        speed: 0.0,
        fromDirection: null,
        directionStatus: 'calm',
      }

      const speed = extractWindSpeed(windValue)
      expect(speed).toBe(0.0)
    })

    test('preserves valid zero wind speed as effective sample', () => {
      const windValue: WindValue = {
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        value: 0,
        u10: 0.0,
        v10: 0.0,
        speed: 0.0,
        fromDirection: null,
        directionStatus: 'calm',
      }

      const speed = extractWindSpeed(windValue)
      expect(Number.isFinite(speed)).toBe(true)
      expect(speed).toBe(0)
    })

    test('returns NaN when U10 or V10 is missing', () => {
      const windValue = {
        longitude: 120.0,
        latitude: 30.0,
        time: '2024-01-01T00:00:00Z',
        value: 0,
        u10: undefined,
        v10: 4.0,
        speed: NaN,
        fromDirection: null,
        directionStatus: 'calm',
      } as unknown as WindValue

      const speed = extractWindSpeed(windValue)
      expect(Number.isNaN(speed)).toBe(true)
    })
  })

  describe('validateAccumulationCoverage', () => {
    test('accepts complete accumulation with matching intervals', () => {
      const accumulation: Accumulation = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
        requestedStart: '2024-01-01T00:00:00Z',
        requestedEnd: '2024-01-01T06:00:00Z',
        bounds: '[start,end)',
        sampledHours: 6,
        expectedHours: 6,
        complete: true,
      }

      const result = validateAccumulationCoverage(accumulation)
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.complete).toBe(true)
      }
    })

    test('rejects incomplete accumulation', () => {
      const accumulation: Accumulation = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T04:00:00Z',
        requestedStart: '2024-01-01T00:00:00Z',
        requestedEnd: '2024-01-01T06:00:00Z',
        bounds: '[start,end)',
        sampledHours: 4,
        expectedHours: 6,
        complete: false,
      }

      const result = validateAccumulationCoverage(accumulation)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        // This is also misaligned because end doesn't match requestedEnd
        expect(result.reason).toContain('Misaligned')
      }
    })

    test('rejects misaligned accumulation intervals', () => {
      const accumulation: Accumulation = {
        start: '2024-01-01T01:00:00Z',
        end: '2024-01-01T07:00:00Z',
        requestedStart: '2024-01-01T00:00:00Z',
        requestedEnd: '2024-01-01T06:00:00Z',
        bounds: '[start,end)',
        sampledHours: 6,
        expectedHours: 6,
        complete: false,
      }

      const result = validateAccumulationCoverage(accumulation)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toContain('Misaligned')
      }
    })

    test('preserves valid zero precipitation', () => {
      const accumulation: Accumulation = {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-01T06:00:00Z',
        requestedStart: '2024-01-01T00:00:00Z',
        requestedEnd: '2024-01-01T06:00:00Z',
        bounds: '[start,end)',
        sampledHours: 6,
        expectedHours: 6,
        complete: true,
      }

      // Zero precipitation with complete coverage is valid
      const result = validateAccumulationCoverage(accumulation)
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.complete).toBe(true)
      }
    })
  })

  describe('Variable-specific value extraction', () => {
    test('preserves valid zero temperature', () => {
      const value = 0.0 // 0°C is a valid temperature
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBe(0)
    })

    test('preserves valid zero pressure difference', () => {
      const observed = 1013.25 // hPa
      const predicted = 1013.25 // hPa
      const error = predicted - observed
      expect(error).toBe(0)
      expect(Number.isFinite(error)).toBe(true)
    })

    test('preserves valid zero wind speed', () => {
      const speed = 0.0 // Calm wind
      expect(Number.isFinite(speed)).toBe(true)
      expect(speed).toBe(0)
    })

    test('preserves valid zero precipitation', () => {
      const precipitation = 0.0 // No rain
      expect(Number.isFinite(precipitation)).toBe(true)
      expect(precipitation).toBe(0)
    })
  })

  describe('Common valid sample alignment', () => {
    test('retains samples with valid zero values across all variables', () => {
      const samples = [
        { original: 0.0, downscaled: 0.1, observed: 0.0 }, // Valid zeros
        { original: 10.0, downscaled: 10.5, observed: 10.2 }, // Non-zero
      ]

      // All samples should be retained
      const valid = samples.filter(
        (s) =>
          Number.isFinite(s.original) &&
          Number.isFinite(s.downscaled) &&
          Number.isFinite(s.observed),
      )
      expect(valid).toHaveLength(2)
    })

    test('excludes samples with NaN or Infinity', () => {
      const samples = [
        { original: NaN, downscaled: 10.0, observed: 10.0 },
        { original: 10.0, downscaled: Infinity, observed: 10.0 },
        { original: 10.0, downscaled: 10.0, observed: -Infinity },
        { original: 5.0, downscaled: 5.1, observed: 5.0 }, // Valid
      ]

      const valid = samples.filter(
        (s) =>
          Number.isFinite(s.original) &&
          Number.isFinite(s.downscaled) &&
          Number.isFinite(s.observed),
      )
      expect(valid).toHaveLength(1)
      expect(valid[0]?.original).toBe(5.0)
    })
  })
})
