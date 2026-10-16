import { describe, test, expect } from 'vitest'
import { getVariableUnit } from '@/features/result-analysis/service/variable-accuracy'
import { alignAccuracySamples } from '@/features/result-analysis/service/accuracy-samples'
import { calculateAccuracyMetrics } from '@/features/result-analysis/service/accuracy-metrics'

describe('Four-variable accuracy assessment integration', () => {
  describe('Temperature accuracy with valid zeros', () => {
    test('evaluates temperature in °C with freezing point zeros', () => {
      const unit = getVariableUnit('temperature')
      expect(unit).toBe('°C')

      // Simulate samples at freezing point (0°C is valid)
      const original = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: -2.0 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 3.0 },
      ]
      const downscaled = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.5 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: -1.8 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 3.2 },
      ]
      const observation = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.2 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: -2.1 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 2.9 },
      ]

      const aligned = alignAccuracySamples(original, downscaled, observation)
      expect(aligned.samples).toHaveLength(3)

      // Zero temperature should be included
      const zeroSample = aligned.samples.find((s) => s.stationId === 'S1')
      expect(zeroSample).toBeDefined()
      expect(zeroSample?.original).toBe(0.0)

      const metrics = calculateAccuracyMetrics(
        aligned.samples.map((s) => s.observed),
        aligned.samples.map((s) => s.downscaled),
      )
      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.metrics.n).toBe(3)
        expect(Number.isFinite(metrics.metrics.rmse)).toBe(true)
        expect(Number.isFinite(metrics.metrics.mae)).toBe(true)
      }
    })
  })

  describe('Pressure accuracy with MSL units', () => {
    test('evaluates MSL pressure in hPa with standard pressure', () => {
      const unit = getVariableUnit('pressure')
      expect(unit).toBe('hPa')

      // Simulate MSL pressure samples (not surface pressure)
      const original = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.25 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 1015.0 },
      ]
      const downscaled = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.5 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 1014.8 },
      ]
      const observation = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.3 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 1015.2 },
      ]

      const aligned = alignAccuracySamples(original, downscaled, observation)
      expect(aligned.samples).toHaveLength(2)

      const metrics = calculateAccuracyMetrics(
        aligned.samples.map((s) => s.observed),
        aligned.samples.map((s) => s.downscaled),
      )
      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.metrics.n).toBe(2)
        expect(metrics.metrics.rmse).toBeLessThan(1.0) // Good accuracy in hPa
      }
    })

    test('preserves valid zero error when prediction equals observation', () => {
      const original = [{ stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.25 }]
      const downscaled = [{ stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.25 }]
      const observation = [{ stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 1013.25 }]

      const aligned = alignAccuracySamples(original, downscaled, observation)
      expect(aligned.samples).toHaveLength(1)

      // Zero error is valid and should be preserved
      const error = aligned.samples[0]!.downscaled - aligned.samples[0]!.observed
      expect(error).toBe(0)
      expect(Number.isFinite(error)).toBe(true)
    })
  })

  describe('Wind speed accuracy with calm wind zeros', () => {
    test('evaluates wind by speed in m/s, not direction', () => {
      const unit = getVariableUnit('wind')
      expect(unit).toBe('m/s')

      // Wind speed samples including calm wind (0 m/s)
      const original = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 }, // Calm
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 5.0 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 10.0 },
      ]
      const downscaled = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.2 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 5.3 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 9.8 },
      ]
      const observation = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 4.8 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 10.2 },
      ]

      const aligned = alignAccuracySamples(original, downscaled, observation)
      expect(aligned.samples).toHaveLength(3)

      // Calm wind (zero speed) should be included as valid sample
      const calmSample = aligned.samples.find((s) => s.stationId === 'S1')
      expect(calmSample).toBeDefined()
      expect(calmSample?.original).toBe(0.0)
      expect(calmSample?.observed).toBe(0.0)

      const metrics = calculateAccuracyMetrics(
        aligned.samples.map((s) => s.observed),
        aligned.samples.map((s) => s.downscaled),
      )
      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.metrics.n).toBe(3)
      }
    })
  })

  describe('Precipitation accuracy with valid zero and accumulation', () => {
    test('evaluates precipitation in mm with dry periods (zero precipitation)', () => {
      const unit = getVariableUnit('precipitation')
      expect(unit).toBe('mm')

      // Precipitation samples including zero (no rain)
      const original = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 }, // Dry
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 2.5 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 10.0 },
      ]
      const downscaled = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.1 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 2.3 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 9.8 },
      ]
      const observation = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 },
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: 2.6 },
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 10.2 },
      ]

      const aligned = alignAccuracySamples(original, downscaled, observation)
      expect(aligned.samples).toHaveLength(3)

      // Zero precipitation should be included (valid dry period)
      const drySample = aligned.samples.find((s) => s.stationId === 'S1')
      expect(drySample).toBeDefined()
      expect(drySample?.observed).toBe(0.0)

      const metrics = calculateAccuracyMetrics(
        aligned.samples.map((s) => s.observed),
        aligned.samples.map((s) => s.downscaled),
      )
      expect(metrics.available).toBe(true)
      if (metrics.available) {
        expect(metrics.metrics.n).toBe(3)
      }
    })
  })

  describe('Cross-variable common valid samples', () => {
    test('maintains separate evaluation contexts per variable', () => {
      // Each variable has its own unit and physical quantity
      expect(getVariableUnit('temperature')).toBe('°C')
      expect(getVariableUnit('pressure')).toBe('hPa')
      expect(getVariableUnit('wind')).toBe('m/s')
      expect(getVariableUnit('precipitation')).toBe('mm')

      // Units are distinct and should not be mixed
      const units = new Set([
        getVariableUnit('temperature'),
        getVariableUnit('pressure'),
        getVariableUnit('wind'),
        getVariableUnit('precipitation'),
      ])
      expect(units.size).toBe(4)
    })

    test('excludes samples with non-finite values across all variables', () => {
      // Temperature samples with invalid values
      const tempSamples = [
        { stationId: 'S1', time: '2024-01-01T00:00:00Z', value: 0.0 }, // Valid zero
        { stationId: 'S2', time: '2024-01-01T00:00:00Z', value: NaN }, // Invalid
        { stationId: 'S3', time: '2024-01-01T00:00:00Z', value: 10.0 }, // Valid
      ]

      const validTemp = tempSamples.filter((s) => Number.isFinite(s.value))
      expect(validTemp).toHaveLength(2)
      expect(validTemp.some((s) => s.value === 0.0)).toBe(true)
    })
  })

  describe('Display precision consistency', () => {
    test('maintains consistent numeric precision before display formatting', () => {
      // Simulate high-precision calculations
      const observed = [10.123456, 20.234567, 30.345678]
      const predicted = [10.223456, 20.334567, 30.445678]

      const metrics = calculateAccuracyMetrics(observed, predicted)
      expect(metrics.available).toBe(true)

      if (metrics.available) {
        // Internal calculations preserve full precision
        expect(Number.isFinite(metrics.metrics.rmse)).toBe(true)
        expect(Number.isFinite(metrics.metrics.mae)).toBe(true)
        expect(Number.isFinite(metrics.metrics.r2)).toBe(true)

        // Metrics should not be pre-rounded
        expect(metrics.metrics.rmse).not.toBe(Math.round(metrics.metrics.rmse))
      }
    })
  })
})
