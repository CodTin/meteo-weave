import { describe, it, expect } from 'vitest'
import { getAccuracyAssessmentData } from '@/server/services/accuracy-assessment.server'

describe.skip('Accuracy Assessment Server - Ticket #72', () => {
  // NOTE: These tests require IndexedDB for task storage, which is not available in node environment.
  // They should either be converted to e2e tests with proper browser environment and task setup,
  // or updated to use mocked task data that doesn't require storage access.
  describe('Station Sampling and Time Coverage', () => {
    it('should query multiple timesteps within budget and report actual coverage', async () => {
      // This test verifies we don't just query the first timestep
      // but sample across the time range within budget
      const taskId = 'test-task-multi-time'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        expect(result.data.samples.timeCoverage.actualTimes).toBeGreaterThan(1)
        expect(result.data.sampling.actual.times).toBeGreaterThan(1)
        // Should report actual queried times, not full task range if sampled
        expect(result.data.sampling.plan).toBeTruthy()
      }
    })

    it('should preserve station identity and location for terrain grouping', async () => {
      const taskId = 'test-task-with-stations'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        expect(result.data.stations).toBeDefined()
        expect(Array.isArray(result.data.stations)).toBe(true)

        // Each station should have ID and location
        for (const station of result.data.stations) {
          expect(station.stationId).toBeTruthy()
          expect(station.location).toBeDefined()
          expect(typeof station.location.lon).toBe('number')
          expect(typeof station.location.lat).toBe('number')
          // Elevation is optional but should be number if present
          if (station.elevation !== undefined) {
            expect(typeof station.elevation).toBe('number')
          }
        }
      }
    })

    it('should distinguish station count from station-time samples', async () => {
      const taskId = 'test-task-station-vs-samples'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        // n is total station-time samples
        expect(result.data.samples.n).toBeGreaterThan(0)
        // stationCount is unique stations
        expect(result.data.samples.stationCount).toBeGreaterThan(0)
        // With multiple timesteps, n should be >= stationCount
        expect(result.data.samples.n).toBeGreaterThanOrEqual(result.data.samples.stationCount)
      }
    })

    it('should mark data source as Synthetic Demo', async () => {
      const taskId = 'test-task-synthetic'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        expect(result.data.method.dataSource).toBe('Synthetic Demo')
      }
    })
  })

  describe('Four Variable Support', () => {
    const testCases = [
      { variable: 'temperature', expectedUnit: '°C' },
      { variable: 'pressure', expectedUnit: 'hPa' },
      { variable: 'wind', expectedUnit: 'm/s' },
      { variable: 'precipitation', expectedUnit: 'mm' },
    ]

    for (const { variable, expectedUnit } of testCases) {
      it(`should handle ${variable} with unit ${expectedUnit}`, async () => {
        const taskId = `test-task-${variable}`

        const result = await getAccuracyAssessmentData(taskId)

        expect(result.ok).toBe(true)
        if (result.data.available) {
          expect(result.data.method.unit).toBe(expectedUnit)
        }
      })
    }
  })

  describe('Common Valid Sample Alignment', () => {
    it('should exclude samples with missing or non-finite values', async () => {
      // Test that we properly filter out NaN, Infinity, or missing values
      const taskId = 'test-task-with-invalid-values'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        // All samples should have valid metrics calculated
        expect(Number.isFinite(result.data.metrics.original.rmse)).toBe(true)
        expect(Number.isFinite(result.data.metrics.original.mae)).toBe(true)
        expect(Number.isFinite(result.data.metrics.downscaled.rmse)).toBe(true)
        expect(Number.isFinite(result.data.metrics.downscaled.mae)).toBe(true)
      }
    })

    it('should handle duplicate matches by keeping only one per station-time', async () => {
      // Verify deduplication as per acceptance criteria
      const taskId = 'test-task-with-duplicates'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        // Sample count should reflect deduplicated station-time pairs
        expect(result.data.samples.n).toBeGreaterThan(0)
      }
    })
  })

  describe('Budget and Sampling Plan', () => {
    it('should report sampling budget and actual usage', async () => {
      const taskId = 'test-task-budget'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        expect(result.data.sampling.budget).toBeDefined()
        expect(result.data.sampling.budget.maxPoints).toBeGreaterThan(0)
        expect(result.data.sampling.budget.maxTimes).toBeGreaterThan(0)

        expect(result.data.sampling.actual).toBeDefined()
        expect(result.data.sampling.actual.points).toBeGreaterThan(0)
        expect(result.data.sampling.actual.times).toBeGreaterThan(0)

        // Actual should not exceed budget
        expect(result.data.sampling.actual.points).toBeLessThanOrEqual(
          result.data.sampling.budget.maxPoints,
        )
        expect(result.data.sampling.actual.times).toBeLessThanOrEqual(
          result.data.sampling.budget.maxTimes,
        )
      }
    })

    it('should provide human-readable sampling plan description', async () => {
      const taskId = 'test-task-plan-description'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        expect(typeof result.data.sampling.plan).toBe('string')
        expect(result.data.sampling.plan.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Error States', () => {
    it('should handle non-existent task gracefully', async () => {
      const taskId = 'non-existent-task-id'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      expect(result.data.available).toBe(false)
      if (!result.data.available) {
        expect(result.data.reason).toBeTruthy()
      }
    })

    it('should handle incomplete task with appropriate message', async () => {
      const taskId = 'test-task-running'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      expect(result.data.available).toBeDefined()
      if (!result.data.available) {
        expect(result.data.reason).toContain('未完成')
      }
    })

    it('should handle zero common samples gracefully', async () => {
      const taskId = 'test-task-no-common-samples'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (!result.data.available) {
        expect(result.data.reason).toContain('没有共同有效样本')
      }
    })
  })

  describe('Metric Calculations', () => {
    it('should calculate RMSE, MAE, and R² correctly', async () => {
      const taskId = 'test-task-metrics'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        // All metrics should be finite numbers
        expect(Number.isFinite(result.data.metrics.original.rmse)).toBe(true)
        expect(Number.isFinite(result.data.metrics.original.mae)).toBe(true)
        expect(Number.isFinite(result.data.metrics.downscaled.rmse)).toBe(true)
        expect(Number.isFinite(result.data.metrics.downscaled.mae)).toBe(true)

        // RMSE and MAE should be non-negative
        expect(result.data.metrics.original.rmse).toBeGreaterThanOrEqual(0)
        expect(result.data.metrics.original.mae).toBeGreaterThanOrEqual(0)
        expect(result.data.metrics.downscaled.rmse).toBeGreaterThanOrEqual(0)
        expect(result.data.metrics.downscaled.mae).toBeGreaterThanOrEqual(0)

        // R² can be NaN for zero variance, but if finite should be reasonable
        if (Number.isFinite(result.data.metrics.original.r2)) {
          expect(result.data.metrics.original.r2).toBeLessThanOrEqual(1)
        }
        if (Number.isFinite(result.data.metrics.downscaled.r2)) {
          expect(result.data.metrics.downscaled.r2).toBeLessThanOrEqual(1)
        }
      }
    })

    it('should show verifiable error improvement or degradation', async () => {
      const taskId = 'test-task-improvement'

      const result = await getAccuracyAssessmentData(taskId)

      expect(result.ok).toBe(true)
      if (result.data.available) {
        // Both original and downscaled metrics should be available for comparison
        expect(result.data.metrics.original).toBeDefined()
        expect(result.data.metrics.downscaled).toBeDefined()

        // We can calculate improvement percentage
        const rmseImprovement =
          ((result.data.metrics.original.rmse - result.data.metrics.downscaled.rmse) /
            result.data.metrics.original.rmse) *
          100

        expect(Number.isFinite(rmseImprovement)).toBe(true)
      }
    })
  })
})
